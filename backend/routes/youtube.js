const express = require("express");
const router = express.Router();
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

const CLIPS_DIR = path.join(__dirname, "../clips");

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
      durationCmd = `yt-dlp --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" "${url}"`;
    } else {
      durationCmd = `yt-dlp --get-duration --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    }
    
    exec(durationCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Duration extraction error:", err);
        console.error("stderr:", stderr);
        return res.status(500).json({ error: "Could not extract video duration", details: err.message });
      }

      const durationStr = stdout.trim();
      if (!durationStr) {
        return res.status(404).json({ error: "No duration found for this video" });
      }

      // Parse duration (format: HH:MM:SS or MM:SS)
      const parts = durationStr.split(':').map(Number);
      let seconds = 0;
      
      if (parts.length === 3) {
        // HH:MM:SS format
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        // MM:SS format
        seconds = parts[0] * 60 + parts[1];
      } else {
        // Just seconds
        seconds = parts[0];
      }

      const maxDuration = 20 * 60; // 20 minutes in seconds
      
      res.json({ 
        duration: seconds,
        durationStr: durationStr,
        isTooLong: seconds > maxDuration,
        maxDuration: maxDuration
      });
    });
  } catch (error) {
    console.error("Duration extraction failed:", error);
    res.status(500).json({ error: "Duration extraction failed", details: error.message });
  }
});

// POST /api/youtube
router.post("/", (req, res) => {
  const { url, name } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: "Missing video URL or desired name." });
  }

  const tempPath = path.join(CLIPS_DIR, `temp_${Date.now()}.m4a`);
  const outputPath = path.join(CLIPS_DIR, `${Date.now()}_${name}.mp3`);

  // Enhanced yt-dlp command with better TikTok and Twitch support
  let ytCmd;
  if (url.includes('tiktok.com')) {
    // Special handling for TikTok with more flexible format selection
    ytCmd = `yt-dlp -f "best[height<=720]/best" --extract-audio --audio-format m4a --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" -o "${tempPath}" "${url}"`;
  } else if (url.includes('twitch.tv')) {
    // Special handling for Twitch with enhanced authentication and format selection
    console.log("Processing Twitch URL:", url);
    console.log("URL includes /clip/:", url.includes('/clip/'));
    
    // Check if it's a clip URL
    if (url.includes('/clip/')) {
      console.log("Processing as Twitch clip");
      // Special handling for Twitch clips
      ytCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format m4a --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" -o "${tempPath}" "${url}"`;
    } else {
      console.log("Processing as Twitch stream/VOD");
      // Standard Twitch stream/VOD handling
      ytCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format m4a --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.twitch.tv/" --add-header "Client-Id:kimne78kx3ncx6brgo4mv6wki5h1ko" -o "${tempPath}" "${url}"`;
    }
  } else {
    // Standard command for other platforms
    ytCmd = `yt-dlp -f bestaudio --extract-audio --audio-format m4a --no-playlist --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "${tempPath}" "${url}"`;
  }
  
  console.log("Running:", ytCmd);

  exec(ytCmd, (err, stdout, stderr) => {
    if (err) {
      console.error("yt-dlp error:", err);
      console.error("stderr:", stderr);
      console.error("stdout:", stdout);
      
      // For TikTok, if we get blocked, return a more specific error
      if (url.includes('tiktok.com') && (stderr.includes('blocked') || stderr.includes('unavailable') || stderr.includes('private'))) {
        return res.status(500).json({ 
          error: "TikTok access blocked", 
          details: "TikTok has blocked access from this IP address or the video is private/unavailable. Please try again later or use a different network." 
        });
      }
      
      // For Twitch, handle common errors
      if (url.includes('twitch.tv')) {
        if (stderr.includes('not currently live') || stderr.includes('offline')) {
          return res.status(500).json({ 
            error: "Twitch stream offline", 
            details: "This Twitch streamer is not currently live. Please try with a live stream or use a VOD URL instead." 
          });
        } else if (stderr.includes('does not exist') || stderr.includes('not found')) {
          return res.status(500).json({ 
            error: "Twitch VOD not found", 
            details: "This Twitch VOD doesn't exist or has been deleted. Please check the URL or try a different VOD." 
          });
        } else if (stderr.includes('unavailable') || stderr.includes('private') || stderr.includes('deleted')) {
          return res.status(500).json({ 
            error: "Twitch video unavailable", 
            details: "This Twitch video is private, unavailable, or has been deleted. Please check if the streamer is currently live or if the VOD is still available." 
          });
        } else if (url.includes('/clip/') && (stderr.includes('clip') || stderr.includes('not found'))) {
          return res.status(500).json({ 
            error: "Twitch clip not found", 
            details: "This Twitch clip doesn't exist or has been deleted. Please check the URL or try a different clip." 
          });
        }
      }
      
      return res.status(500).json({ error: "Video download failed", details: err.message });
    }

    console.log("yt-dlp stdout:", stdout);

    const ffmpegCmd = `ffmpeg -y -i "${tempPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`;

    exec(ffmpegCmd, (err) => {
      fs.unlink(tempPath, () => {}); // cleanup temp file
      if (err) {
        console.error("ffmpeg error:", err);
        return res.status(500).json({ error: "Audio conversion failed", details: err.message });
      }

      // Check file size after conversion (25MB limit)
      const maxSize = 25 * 1024 * 1024; // 25MB in bytes
      const stats = fs.statSync(outputPath);
      if (stats.size > maxSize) {
        // Remove the oversized file
        fs.unlink(outputPath, () => {});
        return res.status(400).json({ 
          error: "File too large", 
          details: "The downloaded audio file exceeds 25MB. Please try a shorter video or clip." 
        });
      }

      res.json({ message: "Video audio saved", filename: path.basename(outputPath) });
    });
  });
});

module.exports = router;
