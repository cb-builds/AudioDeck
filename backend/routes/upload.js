const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const CLIPS_DIR = path.join(__dirname, "../clips");

// Ensure clips directory exists
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR);

router.post("/", (req, res) => {
  console.log("Hit /api/upload");
  console.log("req.files:", req.files);

  if (!req.files || !req.files.audio) {
    return res.status(400).send("No audio file uploaded.");
  }

  const file = req.files.audio;
  
  // Check file size (25MB limit)
  const maxSize = 25 * 1024 * 1024; // 25MB in bytes
  if (file.size > maxSize) {
    return res.status(400).send("File too large. Please select a file smaller than 25MB.");
  }

  const filename = `${Date.now()}_${file.name}`;
  const savePath = path.join(CLIPS_DIR, filename);

  file.mv(savePath, err => {
    if (err) return res.status(500).send(err);
    
    // Extract duration using ffmpeg (cross-platform)
    console.log("Extracting duration for uploaded file:", filename);
    const ffmpegCmd = `ffmpeg -i "${savePath}" -f null - 2>&1`;
    
    exec(ffmpegCmd, (durationErr, durationStdout, durationStderr) => {
      let videoDuration = 0;
      
      if (!durationErr) {
        // Parse duration from ffmpeg output (format: Duration: 00:00:08.62, start: 0.000000, bitrate: 128 kb/s)
        const durationMatch = durationStdout.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          videoDuration = hours * 3600 + minutes * 60 + seconds;
          console.log("Duration extracted:", videoDuration, "seconds");
        } else {
          console.log("Could not parse duration from ffmpeg output:", durationStdout);
        }
      } else {
        console.log("Error extracting duration:", durationErr);
        console.log("ffmpeg stderr:", durationStderr);
      }
      
      res.json({ 
        message: "File uploaded", 
        filename,
        videoDuration: videoDuration
      });
    });
  });
});

module.exports = router;
