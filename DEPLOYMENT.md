# AudioDeck Deployment Guide 🚀

This guide covers deploying AudioDeck to various platforms and environments.

## Prerequisites

Before deploying, ensure you have:
- Node.js 16+ installed
- ffmpeg installed and in PATH
- yt-dlp installed and in PATH
- Git installed

## Local Development Setup

1. **Clone and install**
   ```bash
   git clone <your-repo-url>
   cd audiodeck-initial
   npm run install-all
   ```

2. **Start development servers**
   ```bash
   npm run dev
   ```

3. **Access the application**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:4000

## Production Deployment

### Option 1: Traditional VPS/Server

#### Backend Deployment
1. **Set up your server**
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install ffmpeg
   sudo apt update
   sudo apt install ffmpeg

   # Install yt-dlp
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   ```

2. **Deploy the application**
   ```bash
   git clone <your-repo-url>
   cd audiodeck-initial
   npm run install-all
   ```

3. **Set up environment variables**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your production settings
   ```

4. **Build frontend**
   ```bash
   cd frontend
   npm run build
   ```

5. **Start with PM2**
   ```bash
   npm install -g pm2
   cd backend
   pm2 start server.js --name "audiodeck-backend"
   pm2 startup
   pm2 save
   ```

#### Frontend Deployment
1. **Serve built files**
   ```bash
   # Install nginx
   sudo apt install nginx

   # Copy built files
   sudo cp -r frontend/dist/* /var/www/html/

   # Configure nginx
   sudo nano /etc/nginx/sites-available/audiodeck
   ```

2. **Nginx configuration**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/html;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       location /api {
           proxy_pass http://localhost:4000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Enable site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/audiodeck /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

### Option 2: Docker Deployment

1. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine

   # Install system dependencies
   RUN apk add --no-cache ffmpeg

   # Install yt-dlp
   RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
       chmod a+rx /usr/local/bin/yt-dlp

   # Set working directory
   WORKDIR /app

   # Copy package files
   COPY package*.json ./
   COPY backend/package*.json ./backend/
   COPY frontend/package*.json ./frontend/

   # Install dependencies
   RUN npm run install-all

   # Copy source code
   COPY . .

   # Build frontend
   RUN cd frontend && npm run build

   # Expose port
   EXPOSE 4000

   # Start the application
   CMD ["npm", "start"]
   ```

2. **Create docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     audiodeck:
       build: .
       ports:
         - "4000:4000"
       volumes:
         - ./backend/clips:/app/backend/clips
       environment:
         - NODE_ENV=production
         - PORT=4000
       restart: unless-stopped
   ```

3. **Deploy with Docker**
   ```bash
   docker-compose up -d
   ```

### Option 3: Cloud Platforms

#### Heroku
1. **Create Procfile**
   ```
   web: npm start
   ```

2. **Add buildpacks**
   ```bash
   heroku buildpacks:add --index 1 heroku/nodejs
   heroku buildpacks:add --index 2 https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest
   ```

3. **Deploy**
   ```bash
   heroku create your-audiodeck-app
   git push heroku main
   ```

#### Railway
1. **Connect your repository**
2. **Set environment variables**
3. **Deploy automatically**

#### Render
1. **Create a new Web Service**
2. **Connect your Git repository**
3. **Set build command**: `npm run install-all && cd frontend && npm run build`
4. **Set start command**: `cd backend && npm start`

## Environment Variables

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=4000
NODE_ENV=production

# File Upload Settings
MAX_FILE_SIZE=26214400
MAX_DURATION=1200

# Cleanup Settings
CLEANUP_INTERVAL=1800000
FILE_EXPIRY=3600000
MAX_STORAGE=524288000

# CORS Settings (for production)
CORS_ORIGIN=https://your-domain.com
```

## Security Considerations

1. **HTTPS**: Always use HTTPS in production
2. **CORS**: Configure CORS properly for your domain
3. **Rate Limiting**: Consider adding rate limiting
4. **File Validation**: Ensure proper file type validation
5. **Environment Variables**: Never commit sensitive data

## Monitoring and Maintenance

1. **Logs**: Monitor application logs
2. **Storage**: Monitor disk usage
3. **Performance**: Monitor response times
4. **Updates**: Keep dependencies updated
5. **Backups**: Regular backups of important data

## Troubleshooting

### Common Issues

**"yt-dlp not found"**
- Ensure yt-dlp is installed and in PATH
- Check installation with `which yt-dlp`

**"ffmpeg not found"**
- Ensure ffmpeg is installed and in PATH
- Check installation with `which ffmpeg`

**"Permission denied"**
- Check file permissions
- Ensure proper user permissions

**"Port already in use"**
- Check if another process is using the port
- Change port in configuration

**"Storage full"**
- Check disk space
- Review cleanup settings
- Manually trigger cleanup

## Support

For deployment issues:
1. Check the troubleshooting section
2. Review logs for errors
3. Verify all prerequisites are installed
4. Test locally before deploying

---

**Happy Deploying!** 🎉 