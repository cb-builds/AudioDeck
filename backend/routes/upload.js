const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const CLIPS_DIR = path.join(__dirname, "../clips");

// Ensure clips directory exists
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR);

// Helper function to check if file is video
const isVideoFile = (filename) => {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.mkv'];
  const ext = path.extname(filename).toLowerCase();
  return videoExtensions.includes(ext);
};

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

  const originalFilename = file.name;
  const isVideo = isVideoFile(originalFilename);
  const timestamp = Date.now();
  const filename = `${timestamp}_${path.parse(originalFilename).name}.mp3`;
  const savePath = path.join(CLIPS_DIR, filename);
  const tempFilePath = path.join(CLIPS_DIR, `${timestamp}_original_${originalFilename}`);

  file.mv(tempFilePath, err => {
    if (err) return res.status(500).send(err);
    
    if (isVideo) {
      console.log("Video file detected, extracting audio...");
      // Extract audio from video using ffmpeg
      const ffmpegCmd = `ffmpeg -i "${tempFilePath}" -vn -acodec libmp3lame -ab 128k "${savePath}"`;
      
      exec(ffmpegCmd, (ffmpegErr, ffmpegStdout, ffmpegStderr) => {
        if (ffmpegErr) {
          console.error("ffmpeg error:", ffmpegErr);
          console.error("ffmpeg stderr:", ffmpegStderr);
          // Clean up temp file
          fs.unlinkSync(tempFilePath);
          return res.status(500).send("Error extracting audio from video file.");
        }
        
        // Clean up temp video file
        fs.unlinkSync(tempFilePath);
        
        // Extract duration using ffmpeg
        console.log("Extracting duration for extracted audio file:", filename);
        const durationCmd = `ffmpeg -i "${savePath}" -f null - 2>&1`;
        
        exec(durationCmd, (durationErr, durationStdout, durationStderr) => {
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
            message: "Video file uploaded and audio extracted", 
            filename,
            videoDuration: videoDuration,
            originalFilename: originalFilename
          });
        });
      });
    } else {
      // Audio file - move to final location and extract duration
      fs.renameSync(tempFilePath, savePath);
      
      // Extract duration using ffmpeg (cross-platform)
      console.log("Extracting duration for uploaded audio file:", filename);
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
          message: "Audio file uploaded", 
          filename,
          videoDuration: videoDuration
        });
      });
    }
  });
});

module.exports = router;
