import React, { useState, useRef, useEffect } from "react";
import { truncateText } from "../utils/textUtils";

const UploadForm = ({ onFileUploaded, onDownloadComplete, onExternalUploadStarted, lockVideoPlatformButton, resetInputsKey }) => {
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
  const [currentAudioName, setCurrentAudioName] = useState("");
  const [activeSSEConnections, setActiveSSEConnections] = useState(new Set());
  const [isDownloadStarted, setIsDownloadStarted] = useState(false);

  const progressAnimRef = useRef(null);
  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);

  // Reset inputs when requested by parent (e.g., when TrimEditor appears)
  useEffect(() => {
    setFile(null);
    setYtUrl("");
    const fileEl = document.getElementById('file-upload');
    if (fileEl) fileEl.value = "";
  }, [resetInputsKey]);

  const PROGRESS_TICK_MS = 120; // tick for visible number-by-number
  const PROGRESS_STEP_PERCENT = 1.5; // ~3x faster than 0.5% per tick

  const clearProgressTimer = () => {
    if (progressAnimRef.current) {
      clearInterval(progressAnimRef.current);
      progressAnimRef.current = null;
    }
  };

  const animateProgressTo = (target) => {
    targetProgressRef.current = Math.max(0, Math.min(100, target));
    // Restart timer to head toward new target
    clearProgressTimer();

    const current = currentProgressRef.current;
    const desired = targetProgressRef.current;
    const distance = Math.abs(desired - current);
    
    // If distance is very small, just jump immediately
    if (distance <= 1) {
      currentProgressRef.current = desired;
      updateProgress(Math.round(desired));
      return;
    }
    
    // Calculate dynamic step size to maintain consistent animation duration
    // Base duration: 10% jump should take ~8 ticks (10 / 1.5 * 120ms = ~800ms)
    const baseDistance = 10;
    const baseDuration = (baseDistance / PROGRESS_STEP_PERCENT) * PROGRESS_TICK_MS; // ~800ms
    
    // Calculate step size to make this distance take the same duration
    const totalTicks = baseDuration / PROGRESS_TICK_MS; // ~6.67 ticks
    const stepSize = distance / totalTicks;

    progressAnimRef.current = setInterval(() => {
      const current = currentProgressRef.current;
      const desired = targetProgressRef.current;
      if (Math.abs(desired - current) <= stepSize) {
        currentProgressRef.current = desired;
        updateProgress(Math.round(desired));
        clearProgressTimer();
        return;
      }
      const dir = desired > current ? 1 : -1;
      const next = current + dir * stepSize;
      currentProgressRef.current = next;
      updateProgress(Math.round(next));
    }, PROGRESS_TICK_MS);
  };

  // Helper to add a timeout to fetch requests
  const fetchWithTimeout = (url, options = {}, timeoutMs = 10000) => {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        // Map timeout to the existing backend error message for consistency
        reject(new Error('Output file not found. Please check link and try again.'));
      }, timeoutMs);

      fetch(url, { ...options, signal: controller.signal })
        .then((res) => {
          clearTimeout(timeoutId);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            // Ensure consistent error message on timeout
            reject(new Error('Output file not found. Please check link and try again.'));
          } else {
            reject(err);
          }
        });
    });
  };

  const showErrorPopup = (title, message) => {
    setPopupTitle(title);
    setPopupMessage(message);
    setShowPopup(true);
  };

  const startProgress = (text) => {
    setShowProgress(true);
    setProgressValue(0);
    setProgressText(text);
    currentProgressRef.current = 0;
    targetProgressRef.current = 0;
    clearProgressTimer();
  };

  const updateProgress = (value, text) => {
    setProgressValue(value);
    if (text) setProgressText(text);
  };

  const hideProgress = () => {
    setShowProgress(false);
    setProgressValue(0);
    setProgressText("");
    clearProgressTimer();
    if (onDownloadComplete) {
      onDownloadComplete();
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Check file type (audio/video only)
      const allowedTypes = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/flac',
        'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
        'audio/x-m4a', 'audio/mp4', 'video/x-msvideo', 'video/quicktime'
      ];
      
      if (!allowedTypes.includes(selectedFile.type)) {
        showErrorPopup(
          "❌ Unsupported File Type",
          `The file you selected is not a supported audio or video format.\n\nFile type: ${selectedFile.type || 'Unknown'}\n\nPlease select an audio or video file (MP3, WAV, M4A, MP4, etc.).`
        );
        setStatus("Unsupported file type. Please select an audio or video file.");
        return;
      }
      
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
    
    if (typeof onExternalUploadStarted === 'function') {
      onExternalUploadStarted();
    }
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

      const res = await fetchWithTimeout("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      // Handle HTTP errors explicitly (e.g., 413 from reverse proxy)
      if (!res.ok) {
        if (res.status === 413) {
          hideProgress();
          showErrorPopup(
            "❌ File Size Error",
            "The server rejected the upload (413). Maximum allowed is 25MB. Please select a smaller file."
          );
          setStatus("File too large. Please select a file smaller than 25MB.");
          return;
        }
        const errorText = await res.text().catch(() => "Upload failed");
        hideProgress();
        setStatus(`Upload failed: ${errorText}`);
        return;
      }

      const data = await res.json();
      updateProgress(100, "Upload complete!");
      console.log("Upload response data:", data);
      setStatus(`Uploaded as: ${data.filename}`);
      
      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        console.log("Calling onFileUploaded with duration:", data.videoDuration || 0);
        onFileUploaded(data.filename, fileToUpload.name, data.videoDuration || 0); // Pass server filename, original filename, and duration
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
    if (!ytUrl) return setStatus("Please enter an audio/video URL.");
    setIsVideoUploading(true);
    if (typeof onExternalUploadStarted === 'function') {
      onExternalUploadStarted();
    }
    setIsDownloadStarted(false); // Reset download started flag
    startProgress("Gathering Audio Metadata...");
    setStatus("Gathering Audio Metadata...");
    
    try {
      
      // First, check video duration
      try {
        const durationRes = await fetchWithTimeout(`/api/youtube/duration?url=${encodeURIComponent(ytUrl)}`);
        
        if (durationRes.ok) {
          const durationData = await durationRes.json();
          
          if (durationData.isTooLong) {
            const minutes = Math.floor(durationData.duration / 60);
            const seconds = durationData.duration % 60;
            const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            hideProgress();
            showErrorPopup(
              "❌ Video Too Long",
              `This video is too long to download.\n\nDuration: ${durationFormatted}\nMaximum allowed: 20:00\n\nPlease try a shorter video or clip.`
            );
            setStatus("Video too long. Please try a shorter video.");
            setIsVideoUploading(false);
            return;
          }
        } else {
          const errorText = await durationRes.text();
          hideProgress();
          const message = 'Output file not found. Please check link and try again.';
          showErrorPopup("❌ Download Failed", message);
          setStatus(`Download failed: ${message}`);
          setIsVideoUploading(false);
          return;
        }
      } catch (durationError) {
        // Fail fast on duration errors/timeouts and stop further API calls
        hideProgress();
        const message = (durationError && typeof durationError.message === 'string' && durationError.message.includes('Output file not found'))
          ? durationError.message
          : 'Output file not found. Please check link and try again.';
        showErrorPopup("❌ Download Failed", message);
        setStatus(`Download failed: ${message}`);
        setIsVideoUploading(false);
        return;
      }
      
      // Progress: 10% after duration check
      animateProgressTo(10);
      setProgressText("Gathering Audio Metadata...");
      
      // Get video title before downloading
      let videoName = "Imported Audio";
      try {
        const titleRes = await fetchWithTimeout(`/api/youtube/title?url=${encodeURIComponent(ytUrl)}`);
        
        if (titleRes.ok) {
          const titleData = await titleRes.json();
          videoName = titleData.title || "Imported Audio";
        } else {
          // Fallback to platform-specific naming
          if (ytUrl.includes('youtube.com/') || ytUrl.includes('youtu.be/')) {
            const videoId = ytUrl.includes('v=') ? ytUrl.split('v=')[1]?.split('&')[0] : 
                           ytUrl.includes('youtu.be/') ? ytUrl.split('youtu.be/')[1]?.split('?')[0] : '';
            videoName = videoId ? `YouTube Audio (${videoId})` : "YouTube Audio";
          } else if (ytUrl.includes('tiktok.com/')) {
            const tiktokMatch = ytUrl.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
            if (tiktokMatch) {
              videoName = `TikTok Audio (${tiktokMatch[1]})`;
            } else {
              videoName = "TikTok Audio";
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
                videoName = "Twitch Audio";
              }
            }
          } else if (ytUrl.includes('twitter.com/') || ytUrl.includes('x.com/')) {
            // Extract Twitter/X post information
            const twitterMatch = ytUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/);
            if (twitterMatch) {
              const username = twitterMatch[1];
              const tweetId = twitterMatch[2];
              videoName = `Twitter Post (${username} - ${tweetId})`;
            } else {
              videoName = "Twitter Post";
            }
          } else if (ytUrl.includes('kick.com/')) {
            // Extract Kick streamer information
            const kickMatch = ytUrl.match(/kick\.com\/([^\/\?]+)/);
            if (kickMatch) {
              const streamer = kickMatch[1];
              videoName = `Kick Stream (${streamer})`;
            } else {
              videoName = "Kick Stream";
            }
          }
        }
      } catch (titleError) {
        // Same fallback logic as above
        if (ytUrl.includes('youtube.com/') || ytUrl.includes('youtu.be/')) {
          const videoId = ytUrl.includes('v=') ? ytUrl.split('v=')[1]?.split('&')[0] : 
                         ytUrl.includes('youtu.be/') ? ytUrl.split('youtu.be/')[1]?.split('?')[0] : '';
          videoName = videoId ? `YouTube Audio (${videoId})` : "YouTube Audio";
        } else if (ytUrl.includes('tiktok.com/')) {
          const tiktokMatch = ytUrl.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
          if (tiktokMatch) {
            videoName = `TikTok Audio (${tiktokMatch[1]})`;
          } else {
            videoName = "TikTok Audio";
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
              videoName = "Twitch Audio";
            }
          }
        } else if (ytUrl.includes('twitter.com/') || ytUrl.includes('x.com/')) {
          // Extract Twitter/X post information
          const twitterMatch = ytUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/);
          if (twitterMatch) {
            const username = twitterMatch[1];
            const tweetId = twitterMatch[2];
            videoName = `Twitter Post (${username} - ${tweetId})`;
          } else {
            videoName = "Twitter Post";
          }
        } else if (ytUrl.includes('kick.com/')) {
          // Extract Kick streamer information
          const kickMatch = ytUrl.match(/kick\.com\/([^\/\?]+)/);
          if (kickMatch) {
            const streamer = kickMatch[1];
            videoName = `Kick Stream (${streamer})`;
          } else {
            videoName = "Kick Stream";
          }
        }
      }
      
      // Progress: 20% after title extraction
      animateProgressTo(20);
      setProgressText("Gathering Audio Metadata...");
      
      // Store the video name in state for use in SSE handler
      setCurrentAudioName(videoName);
      
      const res = await fetchWithTimeout("/api/youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          url: ytUrl,
          name: "imported_video" // Add the required name parameter
        }),
      }, 30000); // 30 second timeout for the main download request
      
      // Removed 30% tier at request stage
      
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
      
      const data = await res.json();
      
      // Removed 40% tier at response stage
      
      // Start listening for progress updates if we have a downloadId
      if (data.downloadId) {
        startProgressTracking(data.downloadId, videoName);
      } else {
        // Fallback to simulated progress
        updateProgress(75, "Processing audio...");
        setStatus("Processing audio...");
      }
      
      // Truncate video name for display
      const truncatedVideoName = truncateText(videoName, 50);
      
      // Construct filename from downloadId
      const filename = `${data.downloadId}_imported_video.mp3`;
      
      // Don't call onFileUploaded here - wait for successful completion via SSE
      
    } catch (err) {
      console.error("Video upload error:", err);
      hideProgress();
      // If this was a timeout, surface the known error to the user consistently
      if (err && typeof err.message === 'string' && err.message.includes('Output file not found')) {
        showErrorPopup("❌ Download Failed", err.message);
        setStatus(`Download failed: ${err.message}`);
      } else {
        setStatus(`Video upload failed: ${err.message}`);
      }
      setIsVideoUploading(false);
    } finally {
      // Do not clear isVideoUploading here; it will be cleared on SSE/WS completion
    }
  };

  const startProgressTracking = (downloadId, videoName) => {
    // Prevent duplicate trackers per downloadId
    if (activeSSEConnections.has(downloadId)) {
      return;
    }

    setActiveSSEConnections(prev => new Set([...prev, downloadId]));

    const startSSE = () => {
      console.log(`Starting SSE connection to: /api/youtube/progress/${downloadId}`);
      const es = new EventSource(`/api/youtube/progress/${downloadId}`);
      es.onopen = () => {
        console.log('SSE connection opened successfully');
        animateProgressTo(30);
        setProgressText("Preparing Download...");
      };
      let completionHandled = false;
      let errorHandled = false;
      let lastLoggedProgressSSE = -1;
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            // Only log progress changes in 10% increments or status changes
            const progress = data.progress || 0;
            const status = data.status || 'downloading';
            if (Math.floor(progress / 10) > Math.floor(lastLoggedProgressSSE / 10) || 
                status !== 'downloading' || 
                lastLoggedProgressSSE === -1) {
              console.log(`SSE progress: ${Math.round(progress)}% (${status})`);
              lastLoggedProgressSSE = progress;
            }
            
            const downloadedBytes = data.downloadedBytes || 0;
            const totalBytes = data.totalBytes || 0;
            if (status === 'error' && !errorHandled) {
              errorHandled = true;
              const errorMessage = data.error || 'Download failed';
              hideProgress();
              showErrorPopup("❌ Download Failed", errorMessage);
              setStatus(`Download failed: ${errorMessage}`);
              try { es.close(); } catch (_) {}
              setActiveSSEConnections(prev => { const s=new Set(prev); s.delete(downloadId); return s; });
              setIsVideoUploading(false);
              return;
            }
            if (downloadedBytes === 0 && totalBytes === 0) {
              setProgressText("Preparing Download...");
              setStatus("Preparing Download...");
            } else {
              if (!isDownloadStarted) setIsDownloadStarted(true);
              const mappedProgress = Math.min(100, 30 + (progress * 0.7));
              animateProgressTo(mappedProgress);
              setProgressText("Downloading...");
              setStatus("Downloading...");
            }
            if ((progress >= 100 || status === 'complete') && !completionHandled && !errorHandled) {
              completionHandled = true;
              const filename = `${downloadId}_imported_video.mp3`;
              const truncatedVideoName = truncateText(videoName, 50);
              if (onFileUploaded) onFileUploaded(filename, truncatedVideoName, data.videoDuration);
              setTimeout(() => {
                hideProgress();
                try { es.close(); } catch (_) {}
                setActiveSSEConnections(prev => { const s=new Set(prev); s.delete(downloadId); return s; });
                setIsVideoUploading(false);
              }, 2000);
            }
          }
        } catch (_) {}
      };
      es.onerror = (error) => {
        console.log('SSE connection error:', error);
        try { es.close(); } catch (_) {}
      };
    };

    // Try WebSocket first
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws?downloadId=${downloadId}`;
    console.log(`Attempting WebSocket connection to: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    let wsOpened = false;
    let anyProgress = false;
    let fallbackTriggered = false;
    
    const triggerFallback = () => {
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        console.log('WebSocket failed, falling back to SSE');
        try { ws.close(); } catch (_) {}
        startSSE();
      }
    };
    
    const wsFallbackTimer = setTimeout(() => {
      if (!wsOpened || !anyProgress) {
        triggerFallback();
      }
    }, 1200);

    ws.onopen = () => {
      console.log('WebSocket connection opened successfully');
      wsOpened = true;
      animateProgressTo(30);
      setProgressText("Preparing Download...");
    };

    let completionHandled = false;
    let errorHandled = false;
    let lastLoggedProgress = -1;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          anyProgress = true;
          
          // Only log progress changes in 10% increments or status changes
          const progress = data.progress || 0;
          const status = data.status || 'downloading';
          if (Math.floor(progress / 10) > Math.floor(lastLoggedProgress / 10) || 
              status !== 'downloading' || 
              lastLoggedProgress === -1) {
            console.log(`WebSocket progress: ${Math.round(progress)}% (${status})`);
            lastLoggedProgress = progress;
          }
          
          const downloadedBytes = data.downloadedBytes || 0;
          const totalBytes = data.totalBytes || 0;
          if (status === 'error' && !errorHandled) {
            errorHandled = true;
            const errorMessage = data.error || 'Download failed';
            hideProgress();
            showErrorPopup("❌ Download Failed", errorMessage);
            setStatus(`Download failed: ${errorMessage}`);
            try { ws.close(); } catch (_) {}
            setActiveSSEConnections(prev => { const s=new Set(prev); s.delete(downloadId); return s; });
            setIsVideoUploading(false);
            return;
          }
          if (downloadedBytes === 0 && totalBytes === 0) {
            setProgressText("Preparing Download...");
            setStatus("Preparing Download...");
          } else {
            if (!isDownloadStarted) setIsDownloadStarted(true);
            const mappedProgress = Math.min(100, 30 + (progress * 0.7));
            animateProgressTo(mappedProgress);
            setProgressText("Downloading...");
            setStatus("Downloading...");
          }
          if ((progress >= 100 || status === 'complete') && !completionHandled && !errorHandled) {
            completionHandled = true;
            const filename = `${downloadId}_imported_video.mp3`;
            const truncatedVideoName = truncateText(videoName, 50);
            if (onFileUploaded) onFileUploaded(filename, truncatedVideoName, data.videoDuration);
            setTimeout(() => {
              hideProgress();
              try { ws.close(); } catch (_) {}
              setActiveSSEConnections(prev => { const s=new Set(prev); s.delete(downloadId); return s; });
              setIsVideoUploading(false);
            }, 2000);
          }
        }
      } catch (_) {}
    };
    ws.onerror = () => {
      console.log('WebSocket error detected');
      triggerFallback();
    };
    ws.onclose = (event) => {
      clearTimeout(wsFallbackTimer);
      // If connection closed unexpectedly and no progress received, fallback
      if (!anyProgress && !fallbackTriggered && event.code !== 1000) {
        console.log('WebSocket closed unexpectedly, falling back to SSE');
        triggerFallback();
      }
    };
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
              accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,.avi,.mov,.wmv,.flv,.mkv"
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
            onClick={triggerFileSelect}
            disabled={lockVideoPlatformButton}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <span className="text-white text-lg">🎵</span>
          </div>
          <h2 className="text-xl font-semibold text-white">Upload from Video Platform</h2>
        </div>
        
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex-1 flex items-center">
            <input
              type="text"
              placeholder="Video URL (YouTube, TikTok, Twitch, etc...)"
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
            disabled={!ytUrl || isVideoUploading || lockVideoPlatformButton}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #36D1DC, #5B86E5)',
              boxShadow: '0 4px 15px rgba(54, 209, 220, 0.3)'
            }}
          >
            {isVideoUploading ? (
              <div className="flex items-center justify-center">
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
                  background: 'linear-gradient(135deg, #A44EFF, #427BFF)'
                }}
              >
                <span className="text-white text-lg">📊</span>
              </div>
              <h3 className="text-lg font-semibold text-white">Progress</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  {!isDownloadStarted && showProgress && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  )}
                  <span className="text-sm text-gray-300">{progressText}</span>
                </div>
                <span className="text-sm text-gray-400">{Math.round(progressValue)}%</span>
              </div>
              
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div 
                  className="h-3 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${progressValue}%`,
                    background: 'linear-gradient(to right, #A44EFF, #427BFF)'
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
