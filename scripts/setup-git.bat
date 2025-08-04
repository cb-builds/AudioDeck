@echo off
REM AudioDeck Git Setup Script for Windows
echo 🎵 Setting up AudioDeck for Git deployment...

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Git is not installed. Please install Git first.
    pause
    exit /b 1
)

REM Initialize git repository if not already initialized
if not exist ".git" (
    echo 📁 Initializing git repository...
    git init
)

REM Add all files
echo 📝 Adding files to git...
git add .

REM Create initial commit
echo 💾 Creating initial commit...
git commit -m "Initial commit: AudioDeck application

- Multi-platform video audio downloader (YouTube, TikTok, Twitch)
- File upload with size and duration limits
- Automatic cleanup system
- Modern React frontend with Tailwind CSS
- Node.js backend with Express
- Comprehensive documentation and deployment guides"

echo ✅ Git setup complete!
echo.
echo Next steps:
echo 1. Create a remote repository (GitHub, GitLab, etc.)
echo 2. Add your remote: git remote add origin ^<your-repo-url^>
echo 3. Push to remote: git push -u origin main
echo.
echo For deployment options, see DEPLOYMENT.md
pause 