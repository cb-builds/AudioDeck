const express = require("express");
const router = express.Router();
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

const CLIPS_DIR = path.join(__dirname, "../clips");

// Store active downloads and their progress
const activeDownloads = new Map();

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

  // Check for existing progress
  const download = activeDownloads.get(downloadId);
  if (download) {
    res.write(`data: ${JSON.stringify({ 
      type: 'progress', 
      progress: download.progress,
      downloadedBytes: download.downloadedBytes,
      totalBytes: download.totalBytes,
      status: download.status,
      error: download.error,
      videoDuration: download.videoDuration // Include video duration in initial progress
    })}\n\n`);
  }

  // Set up interval to send progress updates
  const progressInterval = setInterval(() => {
    const download = activeDownloads.get(downloadId);
    if (download) {
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        progress: download.progress,
        downloadedBytes: download.downloadedBytes,
        totalBytes: download.totalBytes,
        status: download.status,
        error: download.error,
        videoDuration: download.videoDuration // Include video duration in interval updates
      })}\n\n`);
    }
  }, 1000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(progressInterval);
  });
});

// GET /api/youtube/duration - Check video duration
router.get("/duration", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing video URL." });
  }

  try {
    // Use yt-dlp to get video duration
    let durationCmd;
    if (url.includes('twitch.tv')) {
      // Enhanced Twitch duration extraction with proper headers
      console.log("Checking duration for Twitch URL:", url);
      
      durationCmd = `yt-dlp --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
    } else {
      // Standard command for other platforms
      durationCmd = `yt-dlp --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    }
    
    exec(durationCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Duration check error:", err);
        console.error("stderr:", stderr);
        
        // If we can't get duration, allow the download to proceed
        // The backend will handle duration limits during actual download
        return res.json({ 
          duration: 0, 
          isTooLong: false,
          message: "Could not check duration, proceeding with download" 
        });
      }

      const durationStr = stdout.trim();
      if (!durationStr) {
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

      const maxDuration = 20 * 60; // 20 minutes in seconds
      const isTooLong = durationSeconds > maxDuration;

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
    return res.status(400).json({ error: "Missing video URL." });
  }

  try {
    // Use yt-dlp to get video title with better TikTok and Twitch support
    let titleCmd;
    if (url.includes('twitch.tv')) {
      // Enhanced Twitch title extraction with proper headers
      console.log("Extracting title for Twitch URL:", url);
      
      // Check if it's a clip URL
      if (url.includes('/clip/')) {
        console.log("Processing Twitch clip for title extraction");
        titleCmd = `yt-dlp --get-title --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
      } else {
        console.log("Processing Twitch stream/VOD for title extraction");
        titleCmd = `yt-dlp --get-title --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
      }
    } else {
      // Standard command for other platforms
      titleCmd = `yt-dlp --get-title --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    }
    
    exec(titleCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Title extraction error:", err);
        console.error("stderr:", stderr);
        
        // For TikTok, if we get blocked, return a generic name
        if (url.includes('tiktok.com') && stderr.includes('blocked')) {
          const tiktokMatch = url.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
          if (tiktokMatch) {
            return res.json({ title: `TikTok Video (${tiktokMatch[1]})` });
          } else {
            return res.json({ title: "TikTok Video" });
          }
        }
        
        // For Twitch, handle unavailable videos
        if (url.includes('twitch.tv')) {
          if (stderr.includes('not currently live') || stderr.includes('offline')) {
            const twitchMatch = url.match(/twitch\.tv\/([^\/]+)/);
            if (twitchMatch) {
              return res.json({ title: `Twitch Stream (${twitchMatch[1]} - Offline)` });
            } else {
              return res.json({ title: "Twitch Stream (Offline)" });
            }
          } else if (stderr.includes('does not exist') || stderr.includes('not found')) {
            return res.json({ title: "Twitch VOD (Not Found)" });
                     } else if (stderr.includes('unavailable') || stderr.includes('private') || stderr.includes('deleted')) {
             const twitchMatch = url.match(/twitch\.tv\/([^\/]+)(?:\/v\/(\d+))?/);
             if (twitchMatch) {
               const streamer = twitchMatch[1];
               const videoId = twitchMatch[2];
               if (videoId) {
                 return res.json({ title: `Twitch VOD (${streamer} - ${videoId})` });
               } else {
                 return res.json({ title: `Twitch Stream (${streamer})` });
               }
             } else {
               return res.json({ title: "Twitch Video" });
             }
           } else if (url.includes('/clip/') && (stderr.includes('clip') || stderr.includes('not found'))) {
             const clipMatch = url.match(/twitch\.tv\/([^\/]+)\/clip\/([^\/\?]+)/);
             if (clipMatch) {
               const streamer = clipMatch[1];
               const clipId = clipMatch[2];
               return res.json({ title: `Twitch Clip (${streamer} - ${clipId})` });
             } else {
               return res.json({ title: "Twitch Clip (Not Found)" });
             }
           }
        }
        
        return res.status(500).json({ error: "Could not extract video title", details: err.message });
      }

      const title = stdout.trim();
      if (!title) {
        return res.status(404).json({ error: "No title found for this video" });
      }

      // Truncate title if it's too long
      const truncatedTitle = title.length > 50 ? title.substring(0, 47) + '...' : title;

      res.json({ title: truncatedTitle });
    });
  } catch (error) {
    console.error("Title extraction failed:", error);
    res.status(500).json({ error: "Title extraction failed", details: error.message });
  }
});

// POST /api/youtube
router.post("/", (req, res) => {
  const { url, name } = req.body;

  console.log("POST /api/youtube called with:", { url, name });

  if (!url || !name) {
    return res.status(400).json({ error: "Missing video URL or desired name." });
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
    status: 'downloading',
    videoDuration: 0 // Store video duration
  });

  console.log("Starting duration extraction...");

  // Extract video duration first
  let durationCmd;
  if (url.includes('twitch.tv')) {
    durationCmd = `yt-dlp --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
  } else {
    durationCmd = `yt-dlp --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
  }

  console.log("About to execute duration command:", durationCmd);
  exec(durationCmd, (durationErr, durationStdout, durationStderr) => {
    console.log("Duration extraction started for URL:", url);
    console.log("Duration command:", durationCmd);
    console.log("Duration stdout:", durationStdout);
    console.log("Duration stderr:", durationStderr);
    console.log("Duration error:", durationErr);
    
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

    // Enhanced yt-dlp command with progress tracking - direct MP3 extraction
    let ytCmd;
    if (url.includes('tiktok.com')) {
      // Special handling for TikTok with more flexible format selection
      ytCmd = `yt-dlp -f "best[height<=720]/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" -o "${outputPath}" --progress-template "%(progress.downloaded_bytes)s/%(progress.total_bytes)s" "${url}"`;
    } else if (url.includes('twitch.tv')) {
      // Special handling for Twitch with enhanced authentication and format selection
      console.log("Processing Twitch URL:", url);
      console.log("URL includes /clip/:", url.includes('/clip/'));
      
      // Check if it's a clip URL
      if (url.includes('/clip/')) {
        console.log("Processing as Twitch clip");
        // Special handling for Twitch clips
        ytCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" -o "${outputPath}" --progress-template "%(progress.downloaded_bytes)s/%(progress.total_bytes)s" "${url}"`;
      } else {
        console.log("Processing as Twitch stream/VOD");
        // Standard Twitch stream/VOD handling
        ytCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format mp3 --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" -o "${outputPath}" --progress-template "%(progress.downloaded_bytes)s/%(progress.total_bytes)s" "${url}"`;
      }
    } else {
      // Standard command for other platforms
      ytCmd = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "${outputPath}" --progress-template "%(progress.downloaded_bytes)s/%(progress.total_bytes)s" "${url}"`;
    }
    
    console.log("Running:", ytCmd);

    // Return the downloadId and duration immediately
    console.log("Sending response with duration:", videoDuration);
    res.json({ 
      message: "Download started", 
      downloadId: downloadId,
      videoDuration: videoDuration
    });

    // Parse progress from yt-dlp output
    const child = exec(ytCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("yt-dlp error:", err);
        console.error("stderr:", stderr);
        console.error("stdout:", stdout);
        
        // Update download status
        const download = activeDownloads.get(downloadId);
        if (download) {
          download.status = 'error';
          download.error = err.message;
        }
        
        // Note: Can't send error response since we already sent the initial response
        // The frontend will handle errors via SSE
        console.error("Download failed:", err.message);
      }

      console.log("yt-dlp stdout:", stdout);

      // Check if file exists before checking size
      try {
        if (fs.existsSync(outputPath)) {
          // Check file size (25MB limit)
          const maxSize = 25 * 1024 * 1024; // 25MB in bytes
          const stats = fs.statSync(outputPath);
          if (stats.size > maxSize) {
            fs.unlinkSync(outputPath);
            // Update download status
            const download = activeDownloads.get(downloadId);
            if (download) {
              download.status = 'error';
              download.error = 'File too large';
            }
            // Note: Can't send error response since we already sent the initial response
            console.error("File too large: File exceeds 25MB limit");
          } else {
            // Update download status to complete
            const download = activeDownloads.get(downloadId);
            if (download) {
              download.status = 'complete';
              download.progress = 100;
            }
          }
        } else {
          // File doesn't exist, which means download failed
          console.error("Download failed: Output file not found. Please check link and try again.");
          const download = activeDownloads.get(downloadId);
          if (download) {
            download.status = 'error';
            download.error = 'Output file not found. Please check link and try again.';
          }
        }
      } catch (error) {
        console.error("Error checking file:", error);
        const download = activeDownloads.get(downloadId);
        if (download) {
          download.status = 'error';
          download.error = error.message;
        }
      }
    });

    // Parse progress from yt-dlp output
    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log("yt-dlp output:", output);
      
      // Parse progress line
      const progressMatch = output.match(/(\d+)\/(\d+)/);
      if (progressMatch) {
        const downloadedBytes = parseInt(progressMatch[1]);
        const totalBytes = parseInt(progressMatch[2]);
        
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 100); // Full 100% for direct MP3 extraction
          
          // Update download tracking
          const download = activeDownloads.get(downloadId);
          if (download) {
            download.progress = progress;
            download.downloadedBytes = downloadedBytes;
            download.totalBytes = totalBytes;
          }
          
          console.log(`Download progress: ${progress}% (${downloadedBytes}/${totalBytes} bytes)`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      console.log("yt-dlp stderr:", output);
      
      // Parse progress line from stderr too
      const progressMatch = output.match(/download:(\d+)\/(\d+)/);
      if (progressMatch) {
        const downloadedBytes = parseInt(progressMatch[1]);
        const totalBytes = parseInt(progressMatch[2]);
        
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 100); // Full 100% for direct MP3 extraction
          
          // Update download tracking
          const download = activeDownloads.get(downloadId);
          if (download) {
            download.progress = progress;
            download.downloadedBytes = downloadedBytes;
            download.totalBytes = totalBytes;
          }
          
          console.log(`Download progress: ${progress}% (${downloadedBytes}/${totalBytes} bytes)`);
        }
      }
    });
  });
});

module.exports = router;
