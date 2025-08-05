# Auto-Restart Setup for AudioDeck

This setup provides automatic restart capabilities for both frontend and backend servers to ensure high availability and better development experience.

## 🚀 Quick Start

### Development Mode (with file watching)
```bash
npm run start:dev
```

### Production Mode (with crash recovery)
```bash
npm run start:prod
```

### Traditional Mode (existing)
```bash
npm run dev
```

## 📋 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Development mode with auto-restart on file changes |
| `npm run start:prod` | Production mode with crash recovery (max 5 restarts) |
| `npm run dev` | Traditional concurrently mode |
| `npm run restart` | Clean and restart all services |

## 🔧 Features

### Development Mode (`start:dev`)
- ✅ **Backend auto-restart**: Uses nodemon to restart on file changes
- ✅ **Frontend auto-reload**: Vite's built-in hot reload
- ✅ **Process monitoring**: Logs when processes start/stop
- ✅ **Graceful shutdown**: Proper cleanup on Ctrl+C

### Production Mode (`start:prod`)
- ✅ **Crash recovery**: Automatically restarts crashed processes
- ✅ **Restart limits**: Maximum 5 restarts per process
- ✅ **Process isolation**: Each process runs independently
- ✅ **Error logging**: Detailed error reporting

## 📁 Configuration Files

### Backend Nodemon Config (`backend/nodemon.json`)
```json
{
  "watch": ["server.js", "routes/", "*.js"],
  "ignore": ["clips/", "node_modules/", "*.log"],
  "ext": "js,json",
  "env": {"NODE_ENV": "development"},
  "restartable": "rs",
  "verbose": true,
  "delay": 1000
}
```

### Process Manager Scripts
- `scripts/start-dev.js`: Development process manager
- `scripts/start-prod.js`: Production process manager

## 🛠️ Installation

1. **Install nodemon for backend**:
   ```bash
   cd backend
   npm install nodemon --save-dev
   ```

2. **Install all dependencies**:
   ```bash
   npm run install-all
   ```

## 🔍 Monitoring

### Development Mode Logs
```
🚀 Starting AudioDeck Development Environment...
📡 Backend will auto-restart on file changes
⚡ Frontend will auto-reload on file changes
✅ Both processes started successfully!
🌐 Frontend: http://localhost:5173
🔧 Backend: http://localhost:3000
```

### Production Mode Logs
```
🚀 Starting AudioDeck Production Environment...
🛡️  Processes will auto-restart on crashes
🔧 Starting backend server...
⚡ Starting frontend server...
✅ Process manager started successfully!
```

## 🚨 Troubleshooting

### Backend Crashes
- Check logs for specific error messages
- Verify all dependencies are installed
- Ensure ports are not in use

### Frontend Crashes
- Check for syntax errors in React components
- Verify Vite configuration
- Clear node_modules and reinstall if needed

### Multiple Restarts
If processes keep restarting:
1. Check the error logs
2. Verify file permissions
3. Ensure no port conflicts
4. Check system resources

## 🔄 Manual Restart

If auto-restart isn't working:

```bash
# Stop all processes
Ctrl+C

# Clean and restart
npm run restart

# Or start individually
npm run backend:dev  # Backend only
npm run frontend     # Frontend only
```

## 📊 Performance

- **Development**: Fast file watching with minimal overhead
- **Production**: Robust crash recovery with restart limits
- **Memory**: Efficient process management
- **CPU**: Minimal monitoring overhead

## 🔐 Security

- Processes run with standard Node.js permissions
- No elevated privileges required
- Standard file system access only
- Network access only to specified ports 