const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const path = require("path");
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
// Serve clips with proper CORS headers
app.use("/clips", (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static(path.join(__dirname, "clips"))); // serve MP3s

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
