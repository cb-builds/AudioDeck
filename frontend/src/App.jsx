import { useState, useEffect } from "react";
import UploadForm from "./components/UploadForm";
import TrimEditor from "./components/TrimEditor";

function App() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [originalFileName, setOriginalFileName] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [lockVideoPlatformButton, setLockVideoPlatformButton] = useState(false);
  const [resetInputsKey, setResetInputsKey] = useState(0);
  const [isNarrowMobile, setIsNarrowMobile] = useState(false); // < 750px

  // Initialize Ko-fi widget
  useEffect(() => {
    // Load Ko-fi script
    const script = document.createElement('script');
    script.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
    script.async = true;
    script.onload = () => {
      // Initialize the widget after script loads
      if (window.kofiWidgetOverlay) {
        window.kofiWidgetOverlay.draw('U6U22J1R0', {
          'type': 'floating-chat',
          'floating-chat.donateButton.text': 'Support me',
          'floating-chat.donateButton.background-color': '#794bc4',
          'floating-chat.donateButton.text-color': '#fff'
        });
        
        // Add custom CSS to position the widget on the bottom right
        const style = document.createElement('style');
        style.textContent = `
          #kofi-widget-overlay {
            left: auto !important;
            right: 20px !important;
            bottom: 20px !important;
          }
          #kofi-widget-overlay iframe {
            left: auto !important;
            right: 0 !important;
          }
        `;
        document.head.appendChild(style);
      }
    };
    document.head.appendChild(script);

    // Cleanup function
    return () => {
      const existingScript = document.querySelector('script[src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"]');
      if (existingScript) {
        existingScript.remove();
      }
      // Remove custom CSS
      const existingStyle = document.querySelector('style');
      if (existingStyle && existingStyle.textContent.includes('kofi-widget-overlay')) {
        existingStyle.remove();
      }
    };
  }, []);

  // Track viewport width to enable responsive behavior at 750px breakpoint
  useEffect(() => {
    const updateIsNarrow = () => {
      try {
        if (typeof window !== 'undefined') {
          setIsNarrowMobile(window.innerWidth < 750);
        }
      } catch (_) {}
    };
    updateIsNarrow();
    window.addEventListener('resize', updateIsNarrow);
    return () => window.removeEventListener('resize', updateIsNarrow);
  }, []);

  const handleFileUploaded = (filename, originalName, duration = 0) => {
    setUploadedFile(filename);
    setOriginalFileName(originalName);
    setVideoDuration(duration);
    setDownloadComplete(false); // Reset download complete state
  };

  const handleDownloadComplete = () => {
    setDownloadComplete(true);
    // Light the button back up as soon as Trim section appears
    setLockVideoPlatformButton(false);
    // Tell UploadForm to clear its inputs when TrimEditor shows
    setResetInputsKey((k) => k + 1);
  };

  const handleExternalUploadStarted = () => {
    // Lock the video platform button until Trim section appears
    setLockVideoPlatformButton(true);
    // Hide Trim section and reset any existing waveform/clip state
    setDownloadComplete(false);
    setUploadedFile(null);
    setOriginalFileName("");
    setVideoDuration(0);
  };

  const handleWaveformReady = () => {
    // Still fine to unlock here as well; App will already unlock on download complete
    setLockVideoPlatformButton(false);
  };

  const handleStartOver = () => {
    // Reset all state as if a new session
    setUploadedFile(null);
    setOriginalFileName("");
    setVideoDuration(0);
    setDownloadComplete(false);
    setLockVideoPlatformButton(false);
    // Also clear any inputs in UploadForm when it reappears
    setResetInputsKey((k) => k + 1);
  };

  return (
    <div 
      className="min-h-screen"
      style={{
        background: 'radial-gradient(circle at 50% 0%, #2A2C4A 0%, #000000 100%)',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/AudioDeck Logo.png" 
              alt="AudioDeck Logo" 
              className="w-20 h-20"
              style={{
                filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.7))'
              }}
            />
            <h1 
              className="text-5xl font-bold"
              style={{
                background: 'linear-gradient(to right, #A44EFF, #427BFF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontFamily: 'Russo One, sans-serif',
                filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.7))',
                marginLeft: '-16px'
              }}
            >
              AudioDeck
            </h1>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {!(isNarrowMobile && uploadedFile && downloadComplete) && (
            <UploadForm 
              onFileUploaded={handleFileUploaded} 
              onDownloadComplete={handleDownloadComplete}
              onExternalUploadStarted={handleExternalUploadStarted}
              lockVideoPlatformButton={lockVideoPlatformButton}
              resetInputsKey={resetInputsKey}
            />
          )}
          
          {uploadedFile && downloadComplete && (
            <TrimEditor 
              key={uploadedFile}
              clip={uploadedFile} 
              originalFileName={originalFileName} 
              expectedDuration={videoDuration}
              onWaveformReady={handleWaveformReady}
              showStartOver={isNarrowMobile}
              onStartOver={handleStartOver}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
