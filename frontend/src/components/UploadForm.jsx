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

  const showErrorPopup = (title, message) => {
    setPopupTitle(title);
    setPopupMessage(message);
    setShowPopup(true);
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
    const formData = new FormData();
    formData.append("audio", fileToUpload);

    try {
      const res = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setStatus(`Uploaded as: ${data.filename}`);
      
      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        onFileUploaded(data.filename, fileToUpload.name); // Pass both server filename and original filename
      }
    } catch (err) {
      setStatus("Upload failed.");
    }
  };

  const handleYoutubeDownload = async () => {
    if (!ytUrl) return setStatus("Please enter a video URL.");
    
    setIsVideoUploading(true);
    setStatus("Checking video duration...");
    
    try {
      console.log("Starting video download for URL:", ytUrl);
      
      // First, check video duration
      console.log("Checking video duration...");
      try {
        const durationRes = await fetch(`http://localhost:4000/api/youtube/duration?url=${encodeURIComponent(ytUrl)}`);
        
        if (durationRes.ok) {
          const durationData = await durationRes.json();
          console.log("Duration data:", durationData);
          
          if (durationData.isTooLong) {
            const minutes = Math.floor(durationData.duration / 60);
            const seconds = durationData.duration % 60;
            const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            console.log("Video too long, showing popup and stopping download");
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
        console.log("Duration check failed:", durationError);
        console.log("Proceeding with download anyway");
      }
      
      setStatus("Getting video title...");
      
      // First, try to get the video title using the new endpoint
      let videoName = "Imported Video";
      
      try {
        console.log("Attempting to get video title...");
        const titleRes = await fetch(`http://localhost:4000/api/youtube/title?url=${encodeURIComponent(ytUrl)}`);
        
        if (titleRes.ok) {
          const titleData = await titleRes.json();
          videoName = titleData.title || "Imported Video";
          console.log("Got video title:", videoName);
        } else {
          console.log("Could not get video title, using fallback");
          // Fallback to platform-specific naming
          if (ytUrl.includes('youtube.com/') || ytUrl.includes('youtu.be/')) {
            const videoId = ytUrl.includes('v=') ? ytUrl.split('v=')[1]?.split('&')[0] : 
                           ytUrl.includes('youtu.be/') ? ytUrl.split('youtu.be/')[1]?.split('?')[0] : '';
            videoName = videoId ? `YouTube Video (${videoId})` : "YouTube Video";
          } else if (ytUrl.includes('tiktok.com/')) {
            const tiktokMatch = ytUrl.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
            if (tiktokMatch) {
              videoName = `TikTok Video (${tiktokMatch[1]})`;
            } else {
              videoName = "TikTok Video";
            }
          } else if (ytUrl.includes('twitch.tv/')) {
            // Extract Twitch streamer name, video ID, or clip ID
            if (ytUrl.includes('/clip/')) {
              // Handle Twitch clips
              const clipMatch = ytUrl.match(/twitch\.tv\/([^\/]+)\/clip\/([^\/\?]+)/);
              if (clipMatch) {
                const streamer = clipMatch[1];
                const clipId = clipMatch[2];
                videoName = `Twitch Clip (${streamer} - ${clipId})`;
              } else {
                videoName = "Twitch Clip";
              }
            } else {
              // Handle Twitch streams and VODs
              const twitchMatch = ytUrl.match(/twitch\.tv\/([^\/]+)(?:\/v\/(\d+))?/);
              if (twitchMatch) {
                const streamer = twitchMatch[1];
                const videoId = twitchMatch[2];
                if (videoId) {
                  videoName = `Twitch VOD (${streamer} - ${videoId})`;
                } else {
                  videoName = `Twitch Stream (${streamer})`;
                }
              } else {
                videoName = "Twitch Video";
              }
            }
          }
        }
      } catch (titleError) {
        console.log("Title extraction failed, using fallback:", titleError);
        // Same fallback logic as above
        if (ytUrl.includes('youtube.com/') || ytUrl.includes('youtu.be/')) {
          const videoId = ytUrl.includes('v=') ? ytUrl.split('v=')[1]?.split('&')[0] : 
                         ytUrl.includes('youtu.be/') ? ytUrl.split('youtu.be/')[1]?.split('?')[0] : '';
          videoName = videoId ? `YouTube Video (${videoId})` : "YouTube Video";
        } else if (ytUrl.includes('tiktok.com/')) {
          const tiktokMatch = ytUrl.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
          if (tiktokMatch) {
            videoName = `TikTok Video (${tiktokMatch[1]})`;
          } else {
            videoName = "TikTok Video";
          }
        } else if (ytUrl.includes('twitch.tv/')) {
          // Extract Twitch streamer name, video ID, or clip ID
          if (ytUrl.includes('/clip/')) {
            // Handle Twitch clips
            const clipMatch = ytUrl.match(/twitch\.tv\/([^\/]+)\/clip\/([^\/\?]+)/);
            if (clipMatch) {
              const streamer = clipMatch[1];
              const clipId = clipMatch[2];
              videoName = `Twitch Clip (${streamer} - ${clipId})`;
            } else {
              videoName = "Twitch Clip";
            }
          } else {
            // Handle Twitch streams and VODs
            const twitchMatch = ytUrl.match(/twitch\.tv\/([^\/]+)(?:\/v\/(\d+))?/);
            if (twitchMatch) {
              const streamer = twitchMatch[1];
              const videoId = twitchMatch[2];
              if (videoId) {
                videoName = `Twitch VOD (${streamer} - ${videoId})`;
              } else {
                videoName = `Twitch Stream (${streamer})`;
              }
            } else {
              videoName = "Twitch Video";
            }
          }
        }
      }
      
      // Extract video ID for filename generation
      let videoId = "";
      
      // Try different URL formats
      if (ytUrl.includes('youtube.com/watch?v=')) {
        videoId = ytUrl.split('v=')[1]?.split('&')[0];
      } else if (ytUrl.includes('youtu.be/')) {
        videoId = ytUrl.split('youtu.be/')[1]?.split('?')[0];
      } else if (ytUrl.includes('youtube.com/embed/')) {
        videoId = ytUrl.split('embed/')[1]?.split('?')[0];
      } else if (ytUrl.includes('tiktok.com/')) {
        // Extract TikTok video ID
        const tiktokMatch = ytUrl.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
        if (tiktokMatch) {
          videoId = tiktokMatch[1];
        }
      } else if (ytUrl.includes('twitch.tv/')) {
        // Extract Twitch video ID, clip ID, or streamer name
        if (ytUrl.includes('/clip/')) {
          // Extract clip ID
          const clipMatch = ytUrl.match(/twitch\.tv\/[^\/]+\/clip\/([^\/\?]+)/);
          if (clipMatch) {
            videoId = clipMatch[1];
          }
        } else {
          // Extract VOD ID or streamer name
          const twitchMatch = ytUrl.match(/twitch\.tv\/[^\/]+\/v\/(\d+)/);
          if (twitchMatch) {
            videoId = twitchMatch[1];
          } else {
            // For live streams, use streamer name as ID
            const streamerMatch = ytUrl.match(/twitch\.tv\/([^\/]+)/);
            if (streamerMatch) {
              videoId = streamerMatch[1];
            }
          }
        }
      }
      
      const generatedName = `imported_${videoId || 'video'}`;
      console.log("Generated filename:", generatedName);
      
      console.log("Sending download request to backend...");
      const res = await fetch("http://localhost:4000/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ytUrl, name: generatedName }),
      });
      
      console.log("Backend response status:", res.status);
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Backend error:", errorData);
        
        // Handle TikTok-specific errors
        if (errorData.error === "TikTok access blocked") {
          showErrorPopup(
            "❌ TikTok Access Blocked",
            "TikTok has blocked access from this IP address.\n\nPlease try again later or use a different network."
          );
          throw new Error("TikTok has blocked access from this IP. Please try again later or use a different network.");
        }
        
        // Handle file size errors
        if (errorData.error === "File too large") {
          showErrorPopup(
            "❌ Video Too Large",
            "The video you're trying to download is too long.\n\nMaximum allowed: 25MB\n\nPlease try a shorter video or clip."
          );
          throw new Error("The video is too long. Please try a shorter video or clip (under 25MB).");
        }
        
        // Handle duration errors
        if (errorData.error === "Video too long") {
          showErrorPopup(
            "❌ Video Too Long",
            "This video exceeds the 20-minute duration limit.\n\nPlease try a shorter video or clip."
          );
          throw new Error("Video too long. Please try a shorter video (under 20 minutes).");
        }
        
        // Handle Twitch-specific errors
        if (errorData.error === "Twitch stream offline") {
          showErrorPopup(
            "❌ Twitch Stream Offline",
            "This Twitch streamer is not currently live.\n\nPlease try with a live stream or use a VOD URL instead."
          );
          throw new Error("Twitch stream offline. Please try with a live stream or use a VOD URL instead.");
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
      
      const data = await res.json();
      console.log("Download successful:", data);
      setStatus(`Uploaded: ${data.filename}`);
      
      // Truncate video name for display
      const truncatedVideoName = truncateText(videoName, 50);
      
      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        onFileUploaded(data.filename, truncatedVideoName);
      }
    } catch (err) {
      console.error("Video upload error:", err);
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
