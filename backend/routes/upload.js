const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

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
    res.json({ message: "File uploaded", filename });
  });
});

module.exports = router;
