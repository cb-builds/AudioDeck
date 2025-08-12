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

// Cookie/env config
const USE_BROWSER_COOKIES = String(process.env.USE_BROWSER_COOKIES || 'false').toLowerCase() === 'true';
const BROWSER_PROFILE_MOUNT_PATH = process.env.BROWSER_PROFILE_MOUNT_PATH || '/browser_profile';

// Simple in-memory metadata cache with single-flight per URL
const META_TTL_MS = 10 * 60 * 1000; // 10 minutes short-lived cache
const metadataCache = new Map(); // url -> { title, duration, durationFormatted, fetchedAt }
const metadataInFlight = new Map(); // url -> Promise

function parseDurationToSeconds(durationStr) {
  const parts = String(durationStr).trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number.isFinite(parts[0]) ? parts[0] : 0;
}

function buildMetaCmd(url) {
  if (url.includes('twitch.tv')) {
    return `yt-dlp -4 --no-playlist --get-title --get-duration --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
  }
  return `yt-dlp -4 --no-playlist --get-title --get-duration --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
}

function isYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return h === 'youtu.be' || h.endsWith('.youtube.com');
  } catch (_) {
    return false;
  }
}

function getCachedMetadata(url) {
  const entry = metadataCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > META_TTL_MS) {
    metadataCache.delete(url);
    return null;
  }
  return entry;
}

async function getMetadata(url) {
  const cached = getCachedMetadata(url);
  if (cached) return cached;

  if (metadataInFlight.has(url)) {
    return metadataInFlight.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const baseCmd = buildMetaCmd(url);
    const useYT = isYouTubeUrl(url);
    const cookiesArg = useYT ? getYoutubeCookiesArg() : '';
    const cmdWithCookies = cookiesArg ? `${baseCmd} ${cookiesArg}` : baseCmd;

    enqueueSiteJob(url, () => new Promise((queueResolve) => {
      const runExec = (cmdStr, allowFallback) => {
        exec(cmdStr, (err, stdout, stderr) => {
          if (err) {
            if (allowFallback && cookiesArg && isLikelyCookieAuthError(stderr || '')) {
              // Retry once without cookies
              return runExec(baseCmd, false);
            }
            console.error("metadata exec error:", err);
            console.error("stderr:", stderr);
            metadataInFlight.delete(url);
            reject(err);
            return queueResolve();
          }
          const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const title = lines[0] || '';
          const durationStr = lines[1] || '';
          const duration = parseDurationToSeconds(durationStr);
          const entry = { title, duration, durationFormatted: durationStr, fetchedAt: Date.now() };
          metadataCache.set(url, entry);
          metadataInFlight.delete(url);
          resolve(entry);
          return queueResolve();
        });
      };

      runExec(cmdWithCookies, true);
    }));
  });

  metadataInFlight.set(url, promise);
  return promise;
}

// Per-site adjustable queue for yt-dlp download concurrency
const MAX_CONCURRENT_DOWNLOADS_PER_SITE = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_DOWNLOADS_PER_SITE || process.env.MAX_CONCURRENT_DOWNLOADS || '1', 10)
);

const siteQueues = new Map(); // siteKey -> { active: number, queue: Array<Function> }

function getSiteKeyFromUrl(url) {
  try {
    const u = new URL(url);
    const rawHost = (u.hostname || '').toLowerCase();
    const host = rawHost.replace(/^www\./, '');

    // Canonicalize known platform domains and shorteners to the same group key
    if (host === 'youtu.be' || host.endsWith('.youtube.com')) return 'youtube';
    if (host === 'x.com' || host === 'twitter.com' || host === 't.co' || host.endsWith('.twitter.com')) return 'twitter';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'vt.tiktok.com') return 'tiktok';
    if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') return 'instagram';
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'clips.twitch.tv') return 'twitch';
    if (host === 'kick.com' || host.endsWith('.kick.com')) return 'kick';
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch' || host === 'fb.com') return 'facebook';
    if (host === 'reddit.com' || host.endsWith('.reddit.com') || host === 'redd.it') return 'reddit';
    if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) return 'soundcloud';
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';

    return host; // fallback to normalized host as the key
  } catch (_) {
    return 'other';
  }
}

function runNextForSite(siteKey) {
  const state = siteQueues.get(siteKey);
  if (!state) return;
  while (state.active < MAX_CONCURRENT_DOWNLOADS_PER_SITE && state.queue.length > 0) {
    const job = state.queue.shift();
    try { job(); } catch (_) {}
  }
}

function enqueueSiteDownloadJob(url, startFn) {
  const siteKey = getSiteKeyFromUrl(url);
  let state = siteQueues.get(siteKey);
  if (!state) {
    state = { active: 0, queue: [] };
    siteQueues.set(siteKey, state);
  }

  return new Promise((resolve, reject) => {
    const job = async () => {
      state.active++;
      try {
        const result = await startFn();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        state.active--;
        runNextForSite(siteKey);
      }
    };
    state.queue.push(job);
    runNextForSite(siteKey);
  });
}

// Generic site job queue (metadata and others)
function enqueueSiteJob(url, startFn) {
  return enqueueSiteDownloadJob(url, startFn);
}

// Firefox profile discovery for cookies-from-browser
let cachedFirefoxProfileDir = null;
function findFirefoxProfileDir() {
  if (cachedFirefoxProfileDir !== null) return cachedFirefoxProfileDir;
  try {
    const iniPath = path.join(BROWSER_PROFILE_MOUNT_PATH, '.mozilla', 'firefox', 'profiles.ini');
    if (!fs.existsSync(iniPath)) {
      cachedFirefoxProfileDir = null;
      return null;
    }
    const content = fs.readFileSync(iniPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const profiles = [];
    let current = {};
    for (const line of lines) {
      if (/^\s*\[Profile/i.test(line)) {
        if (Object.keys(current).length) profiles.push(current);
        current = {};
      } else if (/^\s*Path\s*=/.test(line)) {
        current.Path = line.split('=')[1].trim();
      } else if (/^\s*IsRelative\s*=/.test(line)) {
        current.IsRelative = line.split('=')[1].trim();
      } else if (/^\s*Default\s*=/.test(line)) {
        current.Default = line.split('=')[1].trim();
      }
    }
    if (Object.keys(current).length) profiles.push(current);
    let chosen = profiles.find(p => String(p.Default || '').trim() === '1') || profiles[0];
    if (!chosen || !chosen.Path) {
      cachedFirefoxProfileDir = null;
      return null;
    }
    const isRel = String(chosen.IsRelative || '1').trim() === '1';
    const absPath = isRel
      ? path.join(BROWSER_PROFILE_MOUNT_PATH, '.mozilla', 'firefox', chosen.Path)
      : chosen.Path;
    cachedFirefoxProfileDir = absPath;
    return absPath;
  } catch (e) {
    cachedFirefoxProfileDir = null;
    return null;
  }
}

function getYoutubeCookiesArg() {
  if (!USE_BROWSER_COOKIES) return '';
  const dir = findFirefoxProfileDir();
  if (!dir) return '';
  return `--cookies-from-browser "firefox:${dir}"`;
}

function isLikelyCookieAuthError(stderr) {
  const s = String(stderr || '').toLowerCase();
  return /403|429|cookie|auth|login|required|consent|rate.?limit/.test(s);
}

// Startup health log
if (USE_BROWSER_COOKIES) {
  const dir = findFirefoxProfileDir();
  if (!dir) {
    console.warn('[cookies] USE_BROWSER_COOKIES is enabled but no Firefox profile detected under', path.join(BROWSER_PROFILE_MOUNT_PATH, '.mozilla', 'firefox'));
  } else {
    console.log('[cookies] Firefox profile detected at', dir);
  }
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
    const meta = await getMetadata(url);
    const isTooLong = meta.duration > MAX_DURATION_SECONDS;
    res.json({ duration: meta.duration, isTooLong, durationFormatted: meta.durationFormatted });
  } catch (error) {
    console.error("Duration check failed:", error);
    res.json({ duration: 0, isTooLong: false, message: "Duration check failed, proceeding with download" });
  }
});

// GET /api/youtube/title - Extract video title
router.get("/title", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing audio/video URL." });
  }

  try {
    const meta = await getMetadata(url);
    const title = meta.title || '';
    const truncatedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
    res.json({ title: truncatedTitle });
  } catch (error) {
    console.error("Title extraction failed:", error);
    res.status(500).json({ error: "Audio/video title extraction failed", details: error.message });
  }
});

// POST /api/youtube
router.post("/", async (req, res) => {
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

  console.log("Starting metadata fetch (title + duration)...");
  let videoDuration = 0;
  try {
    const meta = await getMetadata(url);
    videoDuration = Math.max(0, Math.floor(meta.duration || 0));
    const download = activeDownloads.get(downloadId);
    if (download) {
      download.videoDuration = videoDuration;
    }
  } catch (e) {
    console.warn("Metadata fetch failed, proceeding without duration:", e && e.message);
  }

  // Server-side duration gate (cancel early if too long)
  if (videoDuration > MAX_DURATION_SECONDS) {
    // Mark download as error for any listeners
    const dl = activeDownloads.get(downloadId);
    if (dl) {
      dl.status = 'error';
      dl.error = `Video is too long. Max duration is ${Math.floor(MAX_DURATION_SECONDS / 60)} minutes.`;
    }
    return res.status(422).json({
      error: 'Video is too long',
      reason: 'too_long',
      duration: videoDuration,
      maxDuration: MAX_DURATION_SECONDS
    });
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

      // Enqueue the actual yt-dlp download so we never exceed per-site concurrency
      void enqueueSiteDownloadJob(url, () => new Promise((resolve) => {
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
}); // end router.post

module.exports = router;
