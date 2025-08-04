#!/bin/bash

# AudioDeck Git Setup Script
echo "🎵 Setting up AudioDeck for Git deployment..."

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Initialize git repository if not already initialized
if [ ! -d ".git" ]; then
    echo "📁 Initializing git repository..."
    git init
fi

# Add all files
echo "📝 Adding files to git..."
git add .

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "Initial commit: AudioDeck application

- Multi-platform video audio downloader (YouTube, TikTok, Twitch)
- File upload with size and duration limits
- Automatic cleanup system
- Modern React frontend with Tailwind CSS
- Node.js backend with Express
- Comprehensive documentation and deployment guides"

echo "✅ Git setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a remote repository (GitHub, GitLab, etc.)"
echo "2. Add your remote: git remote add origin <your-repo-url>"
echo "3. Push to remote: git push -u origin main"
echo ""
echo "For deployment options, see DEPLOYMENT.md" 