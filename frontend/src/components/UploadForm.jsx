import React, { useState } from "react";
import { truncateText } from "../utils/textUtils";

const UploadForm = ({ onFileUploaded }) => {
  const [file, setFile] = useState(null);
  const [ytUrl, setYtUrl] = useState("");
  const [status, setStatus] = useState("");
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupTitle, setPopupTitle] = useState("");
  
  // Progress bar state
  const [showProgress, setShowProgress] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [progressText, setProgressText] = useState("");

  const showErrorPopup = (title, message) => {
    setPopupTitle(title);
    setPopupMessage(message);
    setShowPopup(true);
  };

  const startProgress = (text) => {
    setShowProgress(true);
    setProgressValue(0);
    setProgressText(text);
  };

  const updateProgress = (value, text) => {
    setProgressValue(value);
    if (text) setProgressText(text);
  };

  const hideProgress = () => {
    setShowProgress(false);
    setProgressValue(0);
    setProgressText("");
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Check file size (25MB limit)
      const maxSize = 25 * 1024 * 1024; // 25MB in bytes
      if (selectedFile.size > maxSize) {
        const fileSizeMB = Math.round(selectedFile.size / (1024 * 1024) * 100) / 100;
        showErrorPopup(
          "❌ File Size Error",
          `The file you selected is too large.\n\nFile size: ${fileSizeMB}MB\nMaximum allowed: 25MB\n\nPlease select a smaller file.`
        );
        setStatus("File too large. Please select a file smaller than 25MB.");
        return;
      }
      
      setFile(selectedFile);
      // Automatically upload the file immediately
      handleFileUpload(selectedFile);
    }
  };

  const handleFileUpload = async (fileToUpload = file) => {
    if (!fileToUpload) return setStatus("No file selected.");
    
    startProgress("Uploading file...");
    
    const formData = new FormData();
    formData.append("audio", fileToUpload);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgressValue(prev => {
          if (prev < 90) return prev + Math.random() * 10;
          return prev;
        });
      }, 200);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      updateProgress(100, "Upload complete!");

      const data = await res.json();
      setStatus(`Uploaded as: ${data.filename}`);
      
      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        onFileUploaded(data.filename, fileToUpload.name); // Pass both server filename and original filename
      }
      
      // Hide progress after a delay
      setTimeout(() => {
        hideProgress();
      }, 2000);
      
    } catch (err) {
      hideProgress();
      setStatus("Upload failed.");
    }
  };

  const handleYoutubeDownload = async () => {
    if (!ytUrl) return setStatus("Please enter a video URL.");
    
    setIsVideoUploading(true);
    startProgress("Checking video duration...");
    setStatus("Checking video duration...");
    
    try {
      console.log("Starting video download for URL:", ytUrl);
      
      // First, check video duration
      console.log("Checking video duration...");
      try {
        const durationRes = await fetch(`/api/youtube/duration?url=${encodeURIComponent(ytUrl)}`);
        
        if (durationRes.ok) {
          const durationData = await durationRes.json();
          console.log("Duration data:", durationData);
          
          if (durationData.isTooLong) {
            const minutes = Math.floor(durationData.duration / 60);
            const seconds = durationData.duration % 60;
            const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            console.log("Video too long, showing popup and stopping download");
            hideProgress();
            showErrorPopup(
              "❌ Video Too Long",
              `This video is too long to download.\n\nDuration: ${durationFormatted}\nMaximum allowed: 20:00\n\nPlease try a shorter video or clip.`
            );
            setStatus("Video too long. Please try a shorter video.");
            setIsVideoUploading(false);
            return;
          } else {
            console.log("Duration check passed, video is within limit");
          }
        } else {
          console.log("Could not check duration, proceeding with download");
        }
      } catch (durationError) {
        console.log("Duration check failed, proceeding with download:", durationError);
      }
      
      updateProgress(25, "Downloading video...");
      setStatus("Downloading video...");
      
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: ytUrl }),
      });
      
      updateProgress(75, "Processing audio...");
      setStatus("Processing audio...");
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Video upload error response:", errorData);
        
        hideProgress();
        
        if (errorData.error === "TikTok access blocked") {
          showErrorPopup(
            "❌ TikTok Access Blocked",
            "TikTok has blocked access to this video.\n\nThis is a common issue with TikTok videos.\nPlease try a different video or platform."
          );
          throw new Error("TikTok access blocked. Please try a different video.");
        } else if (errorData.error === "Twitch stream offline") {
          showErrorPopup(
            "❌ Twitch Stream Offline",
            "This Twitch stream is currently offline.\n\nPlease check if the streamer is live or try a different stream."
          );
          throw new Error("Twitch stream is offline. Please check if the streamer is live.");
        } else if (errorData.error === "Twitch VOD not found") {
          showErrorPopup(
            "❌ Twitch VOD Not Found",
            "This Twitch VOD doesn't exist or has been deleted.\n\nPlease check the URL or try a different VOD."
          );
          throw new Error("Twitch VOD not found. Please check the URL or try a different VOD.");
        } else if (errorData.error === "Twitch clip not found") {
          showErrorPopup(
            "❌ Twitch Clip Not Found",
            "This Twitch clip doesn't exist or has been deleted.\n\nPlease check the URL or try a different clip."
          );
          throw new Error("Twitch clip not found. Please check the URL or try a different clip.");
        }
        
        throw new Error(errorData.error || 'Video upload failed');
      }
      
      updateProgress(100, "Download complete!");
      setStatus("Download complete!");
      
      const data = await res.json();
      console.log("Download successful:", data);
      setStatus(`Uploaded: ${data.filename}`);
      
      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        onFileUploaded(data.filename, "Imported Video");
      }
      
      // Hide progress after a delay
      setTimeout(() => {
        hideProgress();
      }, 2000);
      
    } catch (err) {
      console.error("Video upload error:", err);
      hideProgress();
      setStatus(`Video upload failed: ${err.message}`);
    } finally {
      setIsVideoUploading(false);
    }
  };

  const triggerFileSelect = () => {
    document.getElementById('file-upload').click();
  };

  const handleReupload = () => {
    if (file) {
      handleFileUpload(file);
    } else {
      setStatus("No file selected. Please select a file first.");
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* File Upload Card */}
      <div 
        className="p-6 rounded-2xl flex flex-col"
        style={{
          background: '#14162B',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(167, 139, 250, 0.1)'
        }}
      >
        <div className="flex items-center mb-4">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
            style={{
              background: 'linear-gradient(135deg, #A44EFF, #427BFF)'
            }}
          >
            <span className="text-white text-lg">📁</span>
          </div>
          <h2 className="text-xl font-semibold text-white">Upload Audio File</h2>
        </div>
        
        <div className="space-y-4 flex-1 flex flex-col">
          <div 
            className="border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 hover:border-purple-400 flex-1 flex flex-col justify-center"
            style={{ borderColor: 'rgba(167, 139, 250, 0.3)' }}
          >
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label 
              htmlFor="file-upload"
              className="cursor-pointer block flex flex-col items-center justify-center"
            >
              <div className="text-4xl mb-2">🎵</div>
              <div className="text-gray-300 mb-2 truncate max-w-xs text-center">
                {file ? file.name : "Click to select audio file"}
              </div>
              <div className="text-sm text-gray-500 text-center">
                Supports MP3, WAV, M4A, and more
              </div>
            </label>
          </div>
          
          <button
            onClick={handleReupload}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #A44EFF, #427BFF)',
              boxShadow: '0 4px 15px rgba(164, 78, 255, 0.3)'
            }}
          >
            Upload File
          </button>
        </div>
      </div>

      {/* YouTube Download Card */}
      <div 
        className="p-6 rounded-2xl flex flex-col relative"
        style={{
          background: '#14162B',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(167, 139, 250, 0.1)'
        }}
      >

        
        <div className="flex items-center mb-4">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
            style={{
              background: 'linear-gradient(135deg, #36D1DC, #5B86E5)'
            }}
          >
            <span className="text-white text-lg">🎥</span>
          </div>
          <h2 className="text-xl font-semibold text-white">Upload from Video Platform</h2>
        </div>
        
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex-1 flex items-center">
            <input
              type="text"
              placeholder="Video URL (YouTube, TikTok, Twitch)"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="w-full p-4 rounded-xl text-white placeholder-gray-500 transition-all duration-300 focus:outline-none focus:ring-2"
              style={{
                background: '#1E203A',
                border: '1px solid rgba(167, 139, 250, 0.2)',
                focusRing: '#A44EFF'
              }}
            />
          </div>
          
          <button
            onClick={handleYoutubeDownload}
            disabled={!ytUrl || isVideoUploading}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #36D1DC, #5B86E5)',
              boxShadow: '0 4px 15px rgba(54, 209, 220, 0.3)'
            }}
          >
            {isVideoUploading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Downloading...
              </div>
            ) : (
              "Upload from Video Platform"
            )}
          </button>
        </div>
      </div>

      {/* Progress Bar Section */}
      {showProgress && (
        <div className="col-span-full mt-6">
          <div 
            className="p-6 rounded-2xl"
            style={{
              background: '#14162B',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(167, 139, 250, 0.1)'
            }}
          >
            <div className="flex items-center mb-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
                style={{
                  background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)'
                }}
              >
                <span className="text-white text-lg">⚡</span>
              </div>
              <h3 className="text-lg font-semibold text-white">Progress</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">{progressText}</span>
                <span className="text-sm text-gray-400">{progressValue}%</span>
              </div>
              
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div 
                  className="h-3 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${progressValue}%`,
                    background: 'linear-gradient(90deg, #FF6B6B, #FF8E53)'
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Error Popup Modal */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            className="max-w-md w-full mx-4 p-6 rounded-2xl"
            style={{
              background: '#14162B',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(167, 139, 250, 0.2)'
            }}
          >
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {popupTitle}
              </h3>
              <div className="text-gray-300 mb-6 whitespace-pre-line">
                {popupMessage}
              </div>
              <button
                onClick={() => setShowPopup(false)}
                className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #A44EFF, #427BFF)',
                  boxShadow: '0 4px 15px rgba(164, 78, 255, 0.3)'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadForm;
