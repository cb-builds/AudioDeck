import { useState, useEffect } from "react";
import UploadForm from "./components/UploadForm";
import TrimEditor from "./components/TrimEditor";

function App() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [originalFileName, setOriginalFileName] = useState("");

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

  const handleFileUploaded = (filename, originalName) => {
    setUploadedFile(filename);
    setOriginalFileName(originalName);
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
          <UploadForm onFileUploaded={handleFileUploaded} />
          
          {uploadedFile && (
            <TrimEditor clip={uploadedFile} originalFileName={originalFileName} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
