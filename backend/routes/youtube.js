const express = require("express");
const router = express.Router();
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const { broadcastProgress } = require('../wsHub');
const { writeExpiryMeta } = require('../utils/expiry');

// Track active downloads and their progress
const activeDownloads = new Map();
const progressLoops = new Map();

// Config: max duration gate (minutes -> seconds)
const MAX_DURATION_MINUTES = parseInt(process.env.MAX_DURATION || '20', 10);
const MAX_DURATION_SECONDS = MAX_DURATION_MINUTES * 60;

// Simple adjustable queue for yt-dlp download concurrency
const MAX_CONCURRENT_DOWNLOADS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '1', 10));
let activeDownloadWorkers = 0;
const downloadQueue = [];

function runNextDownloadJob() {
  while (activeDownloadWorkers < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const job = downloadQueue.shift();
    try { job(); } catch (_) {}
  }
}

function enqueueDownloadJob(startFn) {
  return new Promise((resolve, reject) => {
    const job = async () => {
      activeDownloadWorkers++;
      try {
        const result = await startFn();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        activeDownloadWorkers--;
        runNextDownloadJob();
      }
    };
    downloadQueue.push(job);
    runNextDownloadJob();
  });
}

function startProgressLoop(downloadId) {
  if (progressLoops.has(downloadId)) return;
  const interval = setInterval(() => {
    const download = activeDownloads.get(downloadId);
    if (!download) {
      clearInterval(interval);
      progressLoops.delete(downloadId);
      return;
    }

    // Determine best progress source: prefer final MP3, else temp media files
    const finalPath = download.outputPath;
    const basePath = finalPath.endsWith('.mp3') ? finalPath.slice(0, -4) : finalPath;
    const candidatePaths = [
      finalPath,                 // final MP3
      `${basePath}.m4a`,         // audio-only m4a
      `${basePath}.webm`,        // audio-only webm
      `${basePath}.mp4`,         // temp HLS/merged video
      `${finalPath}.part`,
      `${basePath}.m4a.part`,
      `${basePath}.webm.part`,
      `${basePath}.mp4.part`,
    ];

    let progressSourcePath = null;
    let usingTempSource = true;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        progressSourcePath = p;
        if (p === finalPath) usingTempSource = false;
        break;
      }
    }

    if (progressSourcePath) {
      try {
        const stats = fs.statSync(progressSourcePath);
        const currentSize = stats.size;

        if (Math.abs(currentSize - (download.downloadedBytes || 0)) > 1024) {
          download.downloadedBytes = currentSize;

          let newProgress = download.progress || 0;

          if (usingTempSource) {
            const prevEstimate = download.estimatedTempBytes || 0;
            const estimate = Math.max(prevEstimate, Math.floor(currentSize * 1.2), 1024 * 1024);
            download.estimatedTempBytes = estimate;
            const tempProgress = Math.round((currentSize / estimate) * 90);
            newProgress = Math.max(newProgress, Math.min(tempProgress, 90));
          } else {
            let effectiveTotal = 0;
            if (download.expectedTotalBytes && download.expectedTotalBytes > 0) {
              effectiveTotal = download.expectedTotalBytes;
            } else if (download.totalBytes && download.totalBytes > 0) {
              effectiveTotal = download.totalBytes;
            }
            if (effectiveTotal < currentSize) {
              effectiveTotal = currentSize;
            }
            download.totalBytes = effectiveTotal;
            const mp3Progress = Math.round((currentSize / effectiveTotal) * 100);
            newProgress = Math.max(newProgress, Math.min(mp3Progress, 99));
          }

          if (
            typeof download.lastLoggedProgress !== 'number' ||
            newProgress - download.lastLoggedProgress >= 5
          ) {
            console.log(
              `Progress ${downloadId}: ${newProgress}% (source=${usingTempSource ? 'temp' : 'mp3'}, size=${currentSize} bytes)`
            );
            download.lastLoggedProgress = newProgress;
          }

          download.progress = newProgress;
        }
      } catch (error) {
        console.error("Error checking progress source size:", error);
      }
    }

    const displayTotal = usingTempSource
      ? Math.max(download.estimatedTempBytes || 0, download.downloadedBytes || 0)
      : Math.max(
          (download.totalBytes || download.expectedTotalBytes || 0),
          download.downloadedBytes || 0
        );

    const progressData = {
      type: 'progress',
      progress: download.progress,
      downloadedBytes: download.downloadedBytes,
      totalBytes: displayTotal,
      status: download.status,
      error: download.error,
      videoDuration: download.videoDuration
    };

    broadcastProgress(downloadId, progressData);

    if (download.status === 'complete' || download.status === 'error') {
      clearInterval(interval);
      progressLoops.delete(downloadId);
    }
  }, 200);

  progressLoops.set(downloadId, interval);
}

const CLIPS_DIR = path.join(__dirname, "../clips");

// GET /api/youtube/progress/:downloadId - SSE endpoint for progress updates
router.get("/progress/:downloadId", (req, res) => {
  const { downloadId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', downloadId })}\n\n`);
  const existingDownload = activeDownloads.get(downloadId);

  if (existingDownload) {
    const initialProgressData = {
      type: 'progress',
      progress: existingDownload.progress,
      downloadedBytes: existingDownload.downloadedBytes,
      totalBytes: existingDownload.totalBytes,
      status: existingDownload.status,
      error: existingDownload.error,
      videoDuration: existingDownload.videoDuration
    };
    try { res.write(`data: ${JSON.stringify(initialProgressData)}\n\n`); } catch (_) {}
  }

  // Monitor download completion and send final update to SSE client
  const checkCompletion = setInterval(() => {
    const download = activeDownloads.get(downloadId);
    if (!download) {
      clearInterval(checkCompletion);
      try { res.end(); } catch (_) {}
      return;
    }

    if (download.status === 'complete' || download.status === 'error') {
      console.log(`Download ${downloadId} is ${download.status}, closing SSE connection`);
      
      const finalProgressData = {
        type: 'progress',
        progress: download.progress,
        downloadedBytes: download.downloadedBytes,
        totalBytes: download.totalBytes,
        status: download.status,
        error: download.error,
        videoDuration: download.videoDuration
      };
      
      try { res.write(`data: ${JSON.stringify(finalProgressData)}\n\n`); } catch (_) {}
      clearInterval(checkCompletion);
      try { res.end(); } catch (_) {}
    }
  }, 500);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(checkCompletion);
  });
});

// GET /api/youtube/duration - Check video duration
router.get("/duration", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing audio/video URL." });
  }

  try {
    // Use yt-dlp to get audio/video duration
    let durationCmd;
    if (url.includes('twitch.tv')) {
      // Enhanced Twitch duration extraction with proper headers
      console.log("Checking duration for Twitch URL:", url);
      
      durationCmd = `yt-dlp -4 --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
    } else {
      // Standard command for other platforms
      durationCmd = `yt-dlp -4 --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    }
    
    exec(durationCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Duration check error:", err);
        console.error("stderr:", stderr);
        const errText = `${stderr || ''}`;
        // Hard-fail on obvious bad URLs or HTTP errors so frontend cancels early
        if (/HTTP\s+Error|Unsupported URL|Unable to download webpage/i.test(errText)) {
          return res.status(400).json({ error: "Output file not found. Please check link and try again." });
        }
        // Otherwise, allow proceeding as before
        return res.json({ 
          duration: 0, 
          isTooLong: false,
          message: "Could not check duration, proceeding with download" 
        });
      }

      const durationStr = stdout.trim();
      if (!durationStr) {
        const errText = `${stderr || ''}`;
        if (/HTTP\s+Error|Unsupported URL|Unable to download webpage/i.test(errText)) {
          return res.status(400).json({ error: "Output file not found. Please check link and try again." });
        }
        return res.json({ 
          duration: 0, 
          isTooLong: false,
          message: "No duration found, proceeding with download" 
        });
      }

      // Parse duration string (format: HH:MM:SS or MM:SS)
      const parts = durationStr.split(':').map(Number);
      let durationSeconds = 0;
      
      if (parts.length === 3) {
        // HH:MM:SS format
        durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        // MM:SS format
        durationSeconds = parts[0] * 60 + parts[1];
      } else {
        // Just seconds
        durationSeconds = parts[0];
      }

      const isTooLong = durationSeconds > MAX_DURATION_SECONDS;

      res.json({ 
        duration: durationSeconds, 
        isTooLong: isTooLong,
        durationFormatted: durationStr
      });
    });
  } catch (error) {
    console.error("Duration check failed:", error);
    res.json({ 
      duration: 0, 
      isTooLong: false,
      message: "Duration check failed, proceeding with download" 
    });
  }
});

// GET /api/youtube/title - Extract video title
router.get("/title", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing audio/video URL." });
  }

  try {
    // Use yt-dlp to get audio/video title with better TikTok and Twitch support
    let titleCmd;
    if (url.includes('twitch.tv')) {
      // Enhanced Twitch title extraction with proper headers
      console.log("Extracting title for Twitch URL:", url);
      
      // Check if it's a clip URL
      if (url.includes('/clip/')) {
        console.log("Processing Twitch clip for title extraction");
        titleCmd = `yt-dlp -4 --get-title --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
      } else {
        console.log("Processing Twitch stream/VOD for title extraction");
        titleCmd = `yt-dlp -4 --get-title --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
      }
    } else {
      // Standard command for other platforms
      titleCmd = `yt-dlp -4 --get-title --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    }
    
    exec(titleCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Title extraction error:", err);
        console.error("stderr:", stderr);
        const errText = `${stderr || ''}`;
        if (/HTTP\s+Error|Unsupported URL|Unable to download webpage/i.test(errText)) {
          return res.status(400).json({ error: "Output file not found. Please check link and try again." });
        }
        
        // Existing fallbacks (TikTok/Twitch) follow here if desired
        // Otherwise generic error:
        return res.status(500).json({ error: "Could not extract audio/video title", details: err.message });
      }

      const title = stdout.trim();
      if (!title) {
        const errText = `${stderr || ''}`;
        if (/HTTP\s+Error|Unsupported URL|Unable to download webpage/i.test(errText)) {
          return res.status(400).json({ error: "Output file not found. Please check link and try again." });
        }
        return res.status(404).json({ error: "No title found for this audio/video" });
      }

      // Truncate title if it's too long
      const truncatedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;

      res.json({ title: truncatedTitle });
    });
  } catch (error) {
    console.error("Title extraction failed:", error);
    res.status(500).json({ error: "Audio/video title extraction failed", details: error.message });
  }
});

// POST /api/youtube
router.post("/", (req, res) => {
  const { url, name } = req.body;

  console.log("POST /api/youtube called with:", { url, name });

  if (!url || !name) {
    return res.status(400).json({ error: "Missing audio/video URL or desired name." });
  }

  // Quick reject for clearly invalid/generic URLs (e.g., https://x.com without a path)
  try {
    const u = new URL(url);
    if (!u.pathname || u.pathname === '/' || u.hostname.split('.').length < 2) {
      return res.status(400).json({ error: "Output file not found. Please check link and try again." });
    }
  } catch (_) {
    return res.status(400).json({ error: "Output file not found. Please check link and try again." });
  }

  const downloadId = Date.now().toString();
  const outputPath = path.join(CLIPS_DIR, `${downloadId}_${name}.mp3`);

  console.log("Created downloadId:", downloadId);
  console.log("Output path:", outputPath);

  // Initialize download tracking
  activeDownloads.set(downloadId, {
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    status: 'queued',
    videoDuration: 0, // Store video duration
    outputPath: outputPath, // Store the output path for progress tracking
    expectedTotalBytes: 0
  });

  // Start progress loop for WS consumers
  startProgressLoop(downloadId);

  console.log("Starting duration extraction...");

  // Extract video duration first
  let durationCmd;
  if (url.includes('twitch.tv')) {
    durationCmd = `yt-dlp -4 --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
  } else if (url.includes('twitter.com') || url.includes('x.com')) {
    durationCmd = `yt-dlp -4 --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://twitter.com/" "${url}"`;
  } else if (url.includes('instagram.com')) {
    durationCmd = `yt-dlp -4 --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.instagram.com/" "${url}"`;
  } else {
    durationCmd = `yt-dlp -4 --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
  }

  console.log("About to execute duration command:", durationCmd);
  exec(durationCmd, (durationErr, durationStdout, durationStderr) => {
    console.log("Duration extraction started for URL:", url);
    console.log("Duration command:", durationCmd);

    if (durationErr) {
      const errText = `${durationStderr || ''}`;
      if (/HTTP\s+Error|Unsupported URL|Unable to download webpage/i.test(errText)) {
        const dl = activeDownloads.get(downloadId);
        if (dl) {
          dl.status = 'error';
          dl.error = 'Output file not found. Please try again';
        }
        return; // Hard-cancel pipeline silently (frontend will timeout on progress)
      }
    }

    let videoDuration = 0;
    if (!durationErr && durationStdout.trim()) {
      const durationStr = durationStdout.trim();
      console.log("Raw duration string:", durationStr);
      const parts = durationStr.split(':').map(Number);
      console.log("Duration parts:", parts);
      if (parts.length === 3) {
        videoDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        videoDuration = parts[0] * 60 + parts[1];
      } else {
        videoDuration = parts[0];
      }
      console.log("Video duration extracted:", videoDuration, "seconds");
    } else {
      console.log("Could not extract duration, proceeding with download");
      console.log("Duration error details:", durationErr);
      console.log("Duration stdout details:", durationStdout);
    }
    
    const download = activeDownloads.get(downloadId);
    if (download) {
      download.videoDuration = videoDuration;
    }

    // Probe expected filesize (approx) for the selected format to set a stable total
    const sizeCmd = `yt-dlp -4 -f "bestaudio/best" --print "%(filesize_approx)d" --no-warnings --no-playlist --no-download "${url}"`;
    exec(sizeCmd, (sizeErr, sizeStdout, sizeStderr) => {
      let expectedBytes = 0;
      if (!sizeErr && sizeStdout) {
        const out = sizeStdout.toString().trim();
        if (/^\d+$/.test(out)) {
          expectedBytes = parseInt(out, 10);
        }
      }
      if (expectedBytes === 0) {
        // Fallback: estimate from duration at ~128kbps (16 KB/s)
        const bytesPerSecond = 16 * 1024; // 16KB/s
        const seconds = videoDuration || 300;
        expectedBytes = bytesPerSecond * seconds;
      }
      const d = activeDownloads.get(downloadId);
      if (d) {
        d.expectedTotalBytes = expectedBytes;
      }

      // Ensure loop is running (idempotent)
      startProgressLoop(downloadId);

      // Enhanced yt-dlp command with progress tracking - direct MP3 extraction
      let ytCmd;
      if (url.includes('tiktok.com')) {
        // Special handling for TikTok with more flexible format selection
        ytCmd = `yt-dlp -4 -f "best[height<=720]/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --no-progress --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" -o "${outputPath}" "${url}"`;
      } else if (url.includes('twitch.tv')) {
        // Special handling for Twitch with enhanced authentication and format selection
        console.log("Processing Twitch URL:", url);
        console.log("URL includes /clip/:", url.includes('/clip/'));
        
        // Check if it's a clip URL
        if (url.includes('/clip/')) {
          console.log("Processing as Twitch clip");
          // Special handling for Twitch clips
          ytCmd = `yt-dlp -4 -f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --no-progress --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" -o "${outputPath}" "${url}"`;
        } else {
          console.log("Processing as Twitch stream/VOD");
          // Standard Twitch stream/VOD handling
          ytCmd = `yt-dlp -4 -f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --no-progress --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" -o "${outputPath}" "${url}"`;
        }
      } else if (url.includes('twitter.com') || url.includes('x.com')) {
        // Special handling for Twitter/X with enhanced user agent and format selection
        console.log("Processing Twitter/X URL:", url);
        ytCmd = `yt-dlp -4 -f "bestaudio/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --no-progress --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://twitter.com/" -o "${outputPath}" "${url}"`;
      } else if (url.includes('kick.com')) {
        // Special handling for Kick with enhanced user agent and format selection
        console.log("Processing Kick URL:", url);
        ytCmd = `yt-dlp -4 -f "bestaudio/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --no-progress --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://kick.com/" -o "${outputPath}" "${url}"`;
      } else {
        // Standard command for other platforms
        ytCmd = `yt-dlp -4 -f bestaudio --extract-audio --audio-format mp3 --no-playlist --no-warnings --no-progress --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "${outputPath}" "${url}"`;
      }
      
      console.log("Queued download:", ytCmd);

      // Return the downloadId and duration immediately
      res.json({ 
        message: "Download started",
        queued: true,
        downloadId: downloadId,
        videoDuration: videoDuration
      });

      // Enqueue the actual yt-dlp download so we never exceed MAX_CONCURRENT_DOWNLOADS
      void enqueueDownloadJob(() => new Promise((resolve) => {
        // Mark as downloading when slot is available
        const dl0 = activeDownloads.get(downloadId);
        if (dl0) dl0.status = 'downloading';

        // Parse progress from yt-dlp output
        const child = exec(ytCmd, (err, stdout, stderr) => {
          if (err) {
            console.error("yt-dlp error:", err);
            console.error("stderr:", stderr);
            const dl = activeDownloads.get(downloadId);
            if (dl) {
              dl.status = 'error';
              dl.error = err.message;
            }
          }

          // Check if file exists before checking size
          try {
            const dl = activeDownloads.get(downloadId);
            const filePath = dl ? dl.outputPath : outputPath;
            if (fs.existsSync(filePath)) {
              const maxSize = 25 * 1024 * 1024; // 25MB
              const stats = fs.statSync(filePath);
              if (stats.size > maxSize) {
                fs.unlinkSync(filePath);
                if (dl) { dl.status = 'error'; dl.error = 'File too large'; }
                console.error("File too large: File exceeds 25MB limit");
              } else if (dl) {
                try { writeExpiryMeta(filePath, { originalFilename: path.basename(filePath) }); } catch (_) {}
                dl.status = 'complete';
                dl.progress = 100;
                dl.downloadedBytes = stats.size;
                dl.totalBytes = stats.size;
                console.log(`Download completed: ${stats.size} bytes`);
              }
            } else {
              console.error("Download failed: Output file not found. Please try again");
              if (dl) { dl.status = 'error'; dl.error = 'Output file not found. Please try again'; }
            }
          } catch (fileError) {
            console.error("Error checking file:", fileError);
            const dl = activeDownloads.get(downloadId);
            if (dl) { dl.status = 'error'; dl.error = 'Error checking file'; }
          }
          resolve();
        });

        // Optional: suppress chatty progress lines
        child.stdout.on('data', (data) => {
          const output = data.toString();
          if (output.includes('ERROR') || output.includes('WARNING')) {
            console.log("yt-dlp output:", output);
          }
        });
        child.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('ERROR') || output.includes('WARNING')) {
            console.log("yt-dlp stderr:", output);
          }
        });
      }));
    }); // end exec(sizeCmd)
  }); // end exec(durationCmd)
}); // end router.post

module.exports = router;
