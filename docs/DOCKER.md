# AudioDeck Docker Deployment Guide 🐳

This guide covers deploying AudioDeck using Docker and Docker Compose.

## Prerequisites

- **Docker** installed and running
- **Docker Compose** installed
- **OpenSSL** (for generating SSL certificates)

## Quick Start

### 1. Generate SSL Certificates (Optional)

For HTTPS support, generate self-signed certificates:

```bash
# Linux/Mac
chmod +x scripts/generate-ssl.sh
./scripts/generate-ssl.sh

# Windows
scripts\generate-ssl.bat
```

### 2. Build and Run

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 3. Access the Application

- **HTTP**: http://localhost:80 (redirects to HTTPS)
- **HTTPS**: https://localhost:443
- **Direct Backend**: http://localhost:4000

## Docker Configuration

### Services

#### AudioDeck App (`audiodeck`)
- **Port**: 4000
- **Image**: Built from local Dockerfile
- **Volumes**: 
  - `audiodeck_clips`: Persistent audio storage
  - `audiodeck_logs`: Application logs
- **Environment**: Production settings with limits

#### Nginx Proxy (`nginx`)
- **Ports**: 80 (HTTP), 443 (HTTPS)
- **Image**: nginx:alpine
- **Features**: 
  - SSL termination
  - Rate limiting
  - Static file serving
  - Reverse proxy

### Volumes

- **`audiodeck_clips`**: Persistent storage for audio files
- **`audiodeck_logs`**: Application logs
- **SSL certificates**: Mounted from host

### Networks

- **`audiodeck-network`**: Internal communication

## Deployment Options

### Option 1: Development (No SSL)

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  audiodeck:
    build: .
    ports:
      - "4000:4000"
    volumes:
      - audiodeck_clips:/app/backend/clips
    environment:
      - NODE_ENV=development
    restart: unless-stopped
```

### Option 2: Production (With SSL)

Use the full `docker-compose.yml` with nginx proxy.

### Option 3: Custom Domain

1. **Update nginx.conf**:
   ```nginx
   server_name your-domain.com;
   ```

2. **Add SSL certificates**:
   ```bash
   # Copy your certificates to ssl/ directory
   cp your-cert.pem ssl/cert.pem
   cp your-key.pem ssl/key.pem
   ```

3. **Deploy**:
   ```bash
   docker-compose up -d
   ```

## Environment Variables

### Available Variables

```env
# Server Configuration
NODE_ENV=production
PORT=4000

# File Upload Settings
MAX_FILE_SIZE=26214400      # 25MB
MAX_DURATION=1200          # 20 minutes

# Cleanup Settings
CLEANUP_INTERVAL=1800000   # 30 minutes
FILE_EXPIRY=3600000        # 1 hour
MAX_STORAGE=524288000      # 500MB
```

### Custom Configuration

Create a `.env` file:

```env
# Custom settings
MAX_FILE_SIZE=52428800
MAX_DURATION=1800
CLEANUP_INTERVAL=900000
```

Then run:

```bash
docker-compose --env-file .env up -d
```

## Security Features

### Rate Limiting

- **API endpoints**: 10 requests/second
- **Upload endpoints**: 2 requests/second
- **Video download**: 3 requests/second

### Security Headers

- X-Frame-Options
- X-XSS-Protection
- X-Content-Type-Options
- Referrer-Policy
- Content-Security-Policy

### SSL/TLS

- TLS 1.2 and 1.3 support
- HTTP/2 enabled
- Automatic HTTP to HTTPS redirect

## Monitoring and Logs

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f audiodeck
docker-compose logs -f nginx

# Last 100 lines
docker-compose logs --tail=100 audiodeck
```

### Health Checks

```bash
# Check container health
docker-compose ps

# Manual health check
curl https://localhost/health
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df
```

## Backup and Restore

### Backup Audio Files

```bash
# Create backup
docker run --rm -v audiodeck_clips:/data -v $(pwd):/backup alpine tar czf /backup/audiodeck-clips-$(date +%Y%m%d).tar.gz -C /data .

# Restore backup
docker run --rm -v audiodeck_clips:/data -v $(pwd):/backup alpine tar xzf /backup/audiodeck-clips-20240101.tar.gz -C /data
```

### Backup Configuration

```bash
# Backup docker-compose and config files
tar czf audiodeck-config-$(date +%Y%m%d).tar.gz docker-compose.yml nginx.conf ssl/
```

## Troubleshooting

### Common Issues

#### "Port already in use"
```bash
# Check what's using the port
netstat -tulpn | grep :4000

# Stop conflicting services
docker-compose down
```

#### "SSL certificate errors"
```bash
# Regenerate certificates
./scripts/generate-ssl.sh

# Restart nginx
docker-compose restart nginx
```

#### "Permission denied"
```bash
# Fix volume permissions
docker-compose down
sudo chown -R $USER:$USER ssl/
docker-compose up -d
```

#### "Container won't start"
```bash
# Check logs
docker-compose logs audiodeck

# Rebuild image
docker-compose build --no-cache
docker-compose up -d
```

### Debug Commands

```bash
# Enter container
docker-compose exec audiodeck sh

# Check file system
docker-compose exec audiodeck ls -la /app/backend/clips

# Test yt-dlp
docker-compose exec audiodeck yt-dlp --version

# Test ffmpeg
docker-compose exec audiodeck ffmpeg -version
```

## Production Deployment

### 1. Prepare Server

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Deploy Application

```bash
# Clone repository
git clone <your-repo-url>
cd audiodeck-initial

# Generate SSL certificates
./scripts/generate-ssl.sh

# Start services
docker-compose up -d

# Check status
docker-compose ps
```

### 3. Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Enable firewall
sudo ufw enable
```

### 4. Set Up Auto-Restart

```bash
# Enable Docker service
sudo systemctl enable docker

# Create systemd service
sudo nano /etc/systemd/system/audiodeck.service
```

Add to service file:

```ini
[Unit]
Description=AudioDeck Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/audiodeck-initial
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable service:

```bash
sudo systemctl enable audiodeck.service
sudo systemctl start audiodeck.service
```

## Scaling

### Multiple Instances

```yaml
# docker-compose.scale.yml
version: '3.8'
services:
  audiodeck:
    build: .
    deploy:
      replicas: 3
    volumes:
      - audiodeck_clips:/app/backend/clips
    environment:
      - NODE_ENV=production
```

### Load Balancer

Add to nginx.conf:

```nginx
upstream audiodeck_backend {
    server audiodeck:4000;
    server audiodeck2:4000;
    server audiodeck3:4000;
}
```

## Maintenance

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Clean Up

```bash
# Remove unused images
docker image prune -f

# Remove unused volumes
docker volume prune -f

# Remove unused networks
docker network prune -f

# Full cleanup
docker system prune -a
```

### Monitor Storage

```bash
# Check volume usage
docker system df -v

# Clean up old clips
docker-compose exec audiodeck node cleanup.js
```

---

**Happy Docker Deploying!** 🐳 