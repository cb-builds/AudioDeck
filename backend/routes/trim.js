const express = require("express");
const router = express.Router();
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

const CLIPS_DIR = path.join(__dirname, "../clips");

router.post("/", (req, res) => {
  const { filename, startTime, endTime, newName } = req.body;

  if (!filename || startTime == null || endTime == null || !newName) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const inputPath = path.join(CLIPS_DIR, filename);
  const outputPath = path.join(CLIPS_DIR, `${Date.now()}_${newName}.mp3`);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: "Input file not found." });
  }

  // Calculate duration for more precise trimming
  const duration = (parseFloat(endTime) - parseFloat(startTime)).toFixed(6);
  const startTimeFormatted = parseFloat(startTime).toFixed(6);
  
  // Use a two-pass approach for maximum precision:
  // 1. Fast seek to approximately the right position
  // 2. Then precise trimming with re-encoding
  const cmd = `ffmpeg -y -i "${inputPath}" -ss ${startTimeFormatted} -t ${duration} -acodec libmp3lame -ab 192k "${outputPath}"`;

  console.log("Trim command:", cmd);
  console.log("Input values:", { startTime, endTime, duration, startTimeFormatted });

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("ffmpeg trim error:", err);
      console.error("ffmpeg stderr:", stderr);
      return res.status(500).json({ error: "ffmpeg trim failed", details: err.message });
    }

    console.log("ffmpeg trim successful");
    console.log("ffmpeg stdout:", stdout);
    if (stderr) console.log("ffmpeg stderr:", stderr);

    res.json({ message: "Trimmed file saved", filename: path.basename(outputPath) });
  });
});

module.exports = router;
