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
  
  // Use -ss for start time and -t for duration (more accurate than -to)
  // Also use -avoid_negative_ts make_zero for better precision
  const cmd = `ffmpeg -y -ss ${parseFloat(startTime).toFixed(6)} -i "${inputPath}" -t ${duration} -avoid_negative_ts make_zero -c copy "${outputPath}"`;

  exec(cmd, (err) => {
    if (err) return res.status(500).json({ error: "ffmpeg trim failed", details: err.message });

    res.json({ message: "Trimmed file saved", filename: path.basename(outputPath) });
  });
});

module.exports = router;
