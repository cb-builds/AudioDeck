const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");
const { startCleanupScheduler } = require("./cleanup");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url);
  next();
});
// Serve clips with proper CORS headers and additional security headers
app.use("/clips", (req, res, next) => {
  // CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Range, Accept-Ranges');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  
  // Additional headers to prevent blocking
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Cache-Control', 'public, max-age=3600');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
}, express.static(path.join(__dirname, "clips"), {
  // Static file options
  setHeaders: (res, path) => {
    res.set('Content-Type', 'audio/mpeg');
    res.set('Accept-Ranges', 'bytes');
  }
}));

// Routes
app.get("/api/test", (req, res) => {
  res.send("Test route works");
});

// Manual cleanup endpoint
app.post("/api/cleanup", (req, res) => {
  const { cleanupOldClips } = require("./cleanup");
  cleanupOldClips();
  res.json({ message: "Manual cleanup completed" });
});
const uploadRoute = require("./routes/upload");
app.use("/api/upload", uploadRoute);
const youtubeRoute = require("./routes/youtube");
app.use("/api/youtube", youtubeRoute);
const trimRoute = require("./routes/trim");
app.use("/api/trim", trimRoute);

// Alternative audio serving endpoint to avoid ad blockers
app.get("/api/audio/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "clips", filename);
  
  // Security check - ensure file exists and is in clips directory
  if (!fs.existsSync(filePath) || !filePath.startsWith(path.join(__dirname, "clips"))) {
    return res.status(404).json({ error: "Audio file not found" });
  }
  
  // Set proper headers
  res.set('Content-Type', 'audio/mpeg');
  res.set('Accept-Ranges', 'bytes');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Range, Accept-Ranges');
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'public, max-age=3600');
  
  // Stream the file
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Serve frontend build files
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// Handle React routing - serve index.html for all non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`AudioDeck backend running on port ${PORT}`);
  
  // Start the automatic cleanup scheduler
  startCleanupScheduler();
});
