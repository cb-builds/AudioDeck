# AudioDeck

[![Docker Image](https://img.shields.io/badge/Docker%20Image-ghcr.io%2Fcb--builds%2Faudiodeck-blue?style=flat-square&logo=docker)](https://github.com/cb-builds/AudioDeck/packages)

A modern web application for creating and managing audio clips from various video platforms. Upload audio files or download audio from YouTube, TikTok, and Twitch videos to create your personal audio collection.

## Features ✨

- **Multi-Platform Support**: Download audio from YouTube, TikTok, and Twitch
- **File Upload**: Upload local audio files (MP3, WAV, M4A, FLAC)
- **Smart Limits**: 20-minute duration limit and 25MB file size limit
- **Auto Cleanup**: Automatic deletion of old clips after 1 hour
- **Modern UI**: Beautiful, responsive interface with dark theme
- **Real-time Feedback**: Custom popup notifications for errors

## Tech Stack 🛠️

### Frontend
- **React 18** with Vite
- **Tailwind CSS** for styling
- **Custom components** for upload and playback

### Backend
- **Node.js** with Express
- **yt-dlp** for video downloading
- **ffmpeg** for audio conversion
- **Automatic cleanup** system

## Prerequisites 📋

Before running AudioDeck, make sure you have:

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **ffmpeg** installed and available in PATH
- **yt-dlp** installed and available in PATH

### Installing Dependencies

#### FFmpeg
```bash
# Windows (using chocolatey)
choco install ffmpeg

# macOS (using homebrew)
brew install ffmpeg

# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg
```

#### yt-dlp
```bash
# Windows (using chocolatey)
choco install yt-dlp

# macOS (using homebrew)
brew install yt-dlp

# Ubuntu/Debian
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## Installation 🚀

### Option 1: Docker (Recommended)

#### Using Docker Compose
```bash
# Clone the repository
git clone https://github.com/cb-builds/AudioDeck.git
cd AudioDeck

# Start the application
cd deploy
docker-compose up -d

# Access the application
# Frontend & Backend: http://localhost:4000
```

#### Using Portainer
1. **Copy the docker-compose.yml content** from this repository
2. **Paste it into Portainer** under Stacks > Add Stack
3. **Deploy the stack**
4. **Access the application** at `http://your-server-ip:4000`

### Option 2: Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/cb-builds/AudioDeck.git
   cd AudioDeck
   ```

2. **Install dependencies**
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. **Start the development servers**
   ```bash
   # Start backend (from backend directory)
   cd backend
   npm start

   # Start frontend (from frontend directory, in new terminal)
   cd frontend
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000

## Quick Deploy 🚀

### Docker Image
The AudioDeck Docker image is available on GitHub Container Registry:
```bash
docker pull ghcr.io/cb-builds/audiodeck:latest
```

### For Portainer Users
1. **Copy this docker-compose.yml content:**
   ```yaml
   version: '3.8'
   
   services:
     audiodeck:
       build: .
       container_name: audiodeck-app
       ports:
         - "4000:4000"
       volumes:
         - audiodeck_clips:/app/backend/clips
         - audiodeck_logs:/app/logs
       environment:
         - NODE_ENV=production
         - PORT=4000
         - MAX_FILE_SIZE=26214400
         - MAX_DURATION=1200
         - CLEANUP_INTERVAL=1800000
         - FILE_EXPIRY=3600000
         - MAX_STORAGE=524288000
       restart: unless-stopped
       healthcheck:
         test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/api/test', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
         interval: 30s
         timeout: 10s
         retries: 3
         start_period: 40s
   
   volumes:
     audiodeck_clips:
       driver: local
     audiodeck_logs:
       driver: local
   ```

2. **Paste into Portainer** under Stacks > Add Stack
3. **Deploy and access** at `http://your-server-ip:4000`

**Note:** The docker-compose.yml file is located in the `deploy/` directory.

## Usage 📖

### Uploading Audio Files
1. Click on the "Upload Audio File" section
2. Select an audio file (MP3, WAV, M4A, FLAC)
3. File will be automatically uploaded and added to your soundboard

### Downloading from Video Platforms
1. Enter a video URL in the "Upload from Video Platform" section
2. Supported platforms:
   - **YouTube**: Standard YouTube URLs
   - **TikTok**: TikTok video URLs
   - **Twitch**: Live streams, VODs, and clips
3. Click "Upload from Video Platform"
4. Audio will be downloaded and converted automatically

### Playing Audio Clips
- Click on any clip in the audio collection to play it
- Clips are automatically cleaned up after 1 hour

## Configuration ⚙️

### Environment Variables
Create a `.env` file in the backend directory:

```env
PORT=4000
NODE_ENV=development
```

### File Size Limits
- **Upload limit**: 25MB per file
- **Video duration limit**: 20 minutes maximum

### Cleanup Settings
- **Auto cleanup**: Every 30 minutes
- **File expiration**: 1 hour
- **Storage limit**: 500MB (emergency cleanup)

## API Endpoints 🔌

### Upload
- `POST /api/upload` - Upload audio files

### Video Download
- `POST /api/youtube` - Download video audio
- `GET /api/youtube/title` - Get video title
- `GET /api/youtube/duration` - Check video duration

### Cleanup
- `POST /api/cleanup` - Manual cleanup trigger

### Static Files
- `GET /clips/*` - Serve audio files

## Development 🛠️

### Project Structure
```
audiodeck-initial/
├── backend/                    # Node.js backend server
│   ├── routes/                # API endpoints
│   │   ├── upload.js
│   │   ├── youtube.js
│   │   └── trim.js
│   ├── cleanup.js             # Automatic file cleanup
│   ├── server.js              # Main server file
│   └── package.json
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadForm.jsx
│   │   │   ├── Soundboard.jsx
│   │   │   └── TrimEditor.jsx
│   │   ├── utils/
│   │   │   └── textUtils.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   │   └── AudioDeck Logo.png
│   └── package.json
├── docs/                       # Documentation
│   ├── DEPLOYMENT.md
│   └── DOCKER.md
├── deploy/                     # Deployment configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── nginx.conf
│   └── .dockerignore
├── scripts/                    # Utility scripts
│   ├── setup-git.sh
│   ├── setup-git.bat
│   ├── generate-ssl.sh
│   └── generate-ssl.bat
├── README.md                   # This file
├── LICENSE                     # MIT License
├── package.json                # Root package.json
├── .gitignore
└── .gitattributes
```

### Adding New Features
1. Backend changes go in `backend/routes/`
2. Frontend components go in `frontend/src/components/`
3. Utility functions go in `frontend/src/utils/`

## Troubleshooting 🔧

### Common Issues

**"yt-dlp not found"**
- Ensure yt-dlp is installed and in your PATH
- Try running `yt-dlp --version` in terminal

**"ffmpeg not found"**
- Ensure ffmpeg is installed and in your PATH
- Try running `ffmpeg -version` in terminal

**"Port 4000 already in use"**
- Kill existing Node.js processes: `taskkill /f /im node.exe`
- Or change the port in `backend/server.js`

**"Video too long"**
- Videos must be under 20 minutes
- Try shorter clips or different videos

**"File too large"**
- Files must be under 25MB
- Try compressing your audio file

## Contributing 🤝

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Commit your changes: `git commit -m 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

## License 📄

This project is licensed under the MIT License - see the LICENSE file for details.

## Support 💬

If you encounter any issues or have questions:
1. Check the troubleshooting section above
2. Search existing issues
3. Create a new issue with detailed information

---

**AudioDeck** - Your personal audio clip manager 🎵