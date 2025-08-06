import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";

export default function TrimEditor({ clip, originalFileName, expectedDuration = 0 }) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsRef = useRef(null);
  const regionRef = useRef(null);
  const progressTimerRef = useRef(null);
  const audioRef = useRef(null);

  const [status, setStatus] = useState("");
  const [newName, setNewName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [startTime, setStartTime] = useState("0.00");
  const [endTime, setEndTime] = useState("5.00");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackStartTime, setPlaybackStartTime] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const isMountedRef = useRef(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const hasStartedRef = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetries = 30; // Maximum 30 retries (30 seconds)

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!clip) return;

    console.log("Setting up WaveSurfer for clip:", clip);
    console.log("Expected duration:", expectedDuration);
    setStatus("Processing audio waveform...");

    // Reset state for new clip
    setIsInitializing(false);
    setIsReady(false);

    // Simple approach: wait for download to complete, then try to load
    let retryCount = 0;
    const maxRetries = 60; // 60 seconds max (increased from 30)
    
    const checkDownloadComplete = async () => {
      if (retryCount >= maxRetries) {
        console.log("Max retries reached, attempting to load anyway");
        setStatus("Initializing audio waveform...");
        initializeWaveSurfer();
        return;
      }
      
      retryCount++;
      
      try {
        // Check if the file exists and has a reasonable size
        const response = await fetch(`/clips/${clip}`, { method: 'HEAD' });
        if (response.ok) {
          const contentLength = response.headers.get('content-length');
          console.log(`File size check: ${contentLength} bytes for ${clip}`);
          if (contentLength && parseInt(contentLength) > 10000) { // At least 10KB - much more reasonable for short clips
            // Check if file size is stable (not still growing)
            if (retryCount === 0) {
              // First check - store the size and wait
              window.lastFileSize = parseInt(contentLength);
              console.log(`File exists, checking for stability. Size: ${contentLength} bytes`);
              setTimeout(checkDownloadComplete, 2000);
              return;
            } else if (retryCount < 5) {
              // Check if file size has changed
              const currentSize = parseInt(contentLength);
              const lastSize = window.lastFileSize || 0;
              
              if (currentSize === lastSize) {
                // File size is stable, it's ready
                console.log(`File size stable at ${currentSize} bytes, attempting to load WaveSurfer`);
                setStatus("Initializing audio waveform...");
                initializeWaveSurfer();
                return;
              } else {
                // File size is still changing, wait more
                console.log(`File size changing: ${lastSize} → ${currentSize} bytes, retry ${retryCount}/5`);
                window.lastFileSize = currentSize;
                setTimeout(checkDownloadComplete, 2000);
                return;
              }
            } else {
              // Max retries reached, load anyway
              console.log("Max retries reached, attempting to load WaveSurfer");
              setStatus("Initializing audio waveform...");
              initializeWaveSurfer();
            }
          } else {
            console.log(`File too small (${contentLength} bytes), retry ${retryCount}/${maxRetries}`);
            setTimeout(checkDownloadComplete, 1000);
          }
        } else {
          console.log(`File not found, retry ${retryCount}/${maxRetries}`);
          setTimeout(checkDownloadComplete, 1000);
        }
      } catch (error) {
        console.log(`Error checking file, retry ${retryCount}/${maxRetries}:`, error);
        setTimeout(checkDownloadComplete, 1000);
      }
    };

    // Start checking after a longer delay to ensure file is fully processed
    const timer = setTimeout(checkDownloadComplete, 5000); // Increased from 2000 to 5000

    return () => {
      clearTimeout(timer);
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
  }, [clip]);

  // Function to initialize WaveSurfer
  const initializeWaveSurfer = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    // Get container width for zoom calculations
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }

    // Create the regions plugin instance with disabled auto-scroll
    const regionsPlugin = RegionsPlugin.create({
      dragSelection: false, // Disable drag selection
      scrollParent: false, // Disable scroll parent
    });

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#A44EFF", // Design system primary color - keep purple
      progressColor: "#70FFEA", // Design system selected color - blue progress
      height: 150, // Increased height
      url: `/clips/${clip}`, // Use relative URL to work on any server
      interact: false, // Disable default interactions
      plugins: [regionsPlugin],
      autoScroll: false, // Disable auto-scroll
      scrollParent: false, // Disable scroll parent
      backend: 'WebAudio', // Use WebAudio backend for better file reading
      mediaControls: false, // Disable media controls
      responsive: true, // Make it responsive
      normalize: true, // Normalize audio for better visualization
      // Add debugging for file loading
      onloaderror: (error) => {
        console.error("WaveSurfer load error:", error);
      },
      onload: () => {
        console.log("WaveSurfer file loaded successfully");
      }
    });

    // Create separate audio element for playback
    // const audio = new Audio(`http://localhost:4000/clips/${clip}`);
    // audioRef.current = audio;

    // Track retry attempts for duration validation
    let durationRetryCount = 0;
    const maxDurationRetries = 5; // Only retry 5 times for duration issues

    wavesurfer.on("ready", () => {
      wavesurferRef.current = wavesurfer;
      regionsRef.current = regionsPlugin;
      
      const actualDuration = wavesurfer.getDuration();
      console.log("WaveSurfer ready");
      console.log("Duration:", actualDuration);
      console.log("Regions plugin:", regionsRef.current);
      
      // Log duration comparison for debugging
      console.log(`Duration comparison: ${actualDuration}s vs expected ${expectedDuration}s`);
      
      // Only retry if duration is clearly too short (< 1 second) for any file
      if (actualDuration < 1) {
        if (durationRetryCount < maxDurationRetries) {
          durationRetryCount++;
          console.log(`Duration too short (${actualDuration}s), retry ${durationRetryCount}/${maxDurationRetries}...`);
          setStatus("File appears incomplete, retrying...");
          wavesurfer.destroy();
          setTimeout(() => {
            initializeWaveSurfer();
          }, 3000); // Wait 3 seconds before retry
          return;
        } else {
          console.log(`Max duration retries reached (${maxDurationRetries}), accepting current duration: ${actualDuration}s`);
        }
      }
      
      // Accept the actual duration, even if it's shorter than expected
      console.log(`Accepting duration: ${actualDuration}s (expected was ${expectedDuration}s)`);
      
      // If we don't have expected duration, only retry if duration is clearly too short (< 1 second)
      if (expectedDuration === 0 && actualDuration < 1) {
        if (durationRetryCount < maxDurationRetries) {
          durationRetryCount++;
          console.log(`Duration too short (${actualDuration}s), retry ${durationRetryCount}/${maxDurationRetries}...`);
          setStatus("File appears incomplete, retrying...");
          wavesurfer.destroy();
          setTimeout(() => {
            initializeWaveSurfer();
          }, 3000); // Wait 3 seconds before retry
          return;
        } else {
          console.log(`Max duration retries reached (${maxDurationRetries}), accepting current duration: ${actualDuration}s`);
        }
      }
      
      setIsReady(true);
      setIsInitializing(false); // Reset initialization flag
      setDuration(actualDuration);
      
      // Add a default region
      try {
        const defaultRegion = regionsRef.current.addRegion({
          start: 0,
          end: 5,
          color: "rgba(135, 206, 250, 0.3)", // Light blue highlight
          drag: !shouldDisableDrag(), // Disable drag if handles not visible
          resize: true,
        });
        
        regionRef.current = defaultRegion;
        console.log("Default region created:", defaultRegion);
        setStatus("Default region created successfully");
        
        // Update timestamp inputs
        setStartTime("0.00");
        setEndTime("5.00");
      } catch (error) {
        console.error("Error creating default region:", error);
        setStatus("Error creating default region: " + error.message);
      }
    });

    wavesurfer.on("error", (error) => {
      console.error("WaveSurfer error:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        clip: clip,
        url: `/clips/${clip}`
      });
      setStatus("WaveSurfer error: " + error.message);
    });

    wavesurfer.on("load-error", (error) => {
      console.error("WaveSurfer load error:", error);
      setStatus("Failed to load audio file: " + error.message);
      
      // Try alternative URL if the first one fails
      console.log("Trying alternative URL...");
      wavesurfer.load(`/api/audio/${clip}`);
    });

    // Add a fallback mechanism for different backends
    let retryCount = 0;
    const maxRetries = 2;
    
    wavesurfer.on("error", (error) => {
      console.error("WaveSurfer error:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        clip: clip,
        url: retryCount === 0 ? `/clips/${clip}` : `/api/audio/${clip}`
      });
      
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retry ${retryCount}/${maxRetries}: Trying alternative endpoint...`);
        
        // Try alternative endpoint
        const alternativeUrl = retryCount === 1 ? `/api/audio/${clip}` : `/clips/${clip}`;
        wavesurfer.load(alternativeUrl);
      } else {
        // If all retries failed, try WebAudio backend as last resort
        console.log("All endpoints failed, trying WebAudio backend...");
        setStatus("Trying alternative audio backend...");
        
        // Destroy current instance and recreate with WebAudio backend
        wavesurfer.destroy();
        
        const fallbackWavesurfer = WaveSurfer.create({
          container: containerRef.current,
          waveColor: "#A44EFF",
          progressColor: "#70FFEA",
          height: 150,
          url: `/clips/${clip}`,
          interact: false,
          plugins: [regionsPlugin],
          autoScroll: false,
          scrollParent: false,
          backend: 'WebAudio', // Try WebAudio as fallback
          mediaControls: false,
          responsive: true,
          normalize: true,
        });
        
        // Set up the same event handlers for the fallback
        fallbackWavesurfer.on("ready", () => {
          wavesurferRef.current = fallbackWavesurfer;
          regionsRef.current = regionsPlugin;
          setIsReady(true);
          setIsInitializing(false); // Reset initialization flag
          retryCountRef.current = 0; // Reset retry counter on success
          setDuration(fallbackWavesurfer.getDuration());
          console.log("Fallback WaveSurfer ready");
          console.log("Duration:", fallbackWavesurfer.getDuration());
          
          // Add default region
          try {
            const defaultRegion = regionsRef.current.addRegion({
              start: 0,
              end: 5,
              color: "rgba(135, 206, 250, 0.3)",
              drag: !shouldDisableDrag(),
              resize: true,
            });
            
            regionRef.current = defaultRegion;
            setStartTime("0.00");
            setEndTime("5.00");
          } catch (error) {
            console.error("Error creating default region:", error);
            setStatus("Error creating default region: " + error.message);
          }
        });
        
        fallbackWavesurfer.on("error", (fallbackError) => {
          console.error("Fallback WaveSurfer also failed:", fallbackError);
          setStatus("Failed to load audio file with both backends");
        });
      }
    });

    // Listen for all possible region events
    wavesurfer.on("region-updated", (region) => {
      console.log("REGION-UPDATED event fired:", region);
      regionRef.current = region;
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    wavesurfer.on("region-update-end", (region) => {
      console.log("REGION-UPDATE-END event fired:", region);
      regionRef.current = region;
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    wavesurfer.on("region-drag-start", (region) => {
      console.log("REGION-DRAG-START event fired:", region);
    });

    wavesurfer.on("region-drag", (region) => {
      console.log("REGION-DRAG event fired:", region);
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    wavesurfer.on("region-drag-end", (region) => {
      console.log("REGION-DRAG-END event fired:", region);
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    wavesurfer.on("region-resize-start", (region) => {
      console.log("REGION-RESIZE-START event fired:", region);
    });

    wavesurfer.on("region-resize", (region) => {
      console.log("REGION-RESIZE event fired:", region);
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    wavesurfer.on("region-resize-end", (region) => {
      console.log("REGION-RESIZE-END event fired:", region);
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    // Add region playback events like in the example
    wavesurfer.on("region-in", (region) => {
      console.log("REGION-IN event fired:", region);
    });

    wavesurfer.on("region-out", (region) => {
      console.log("REGION-OUT event fired:", region);
      // Stop playback when region ends
      if (wavesurferRef.current) {
        wavesurferRef.current.pause();
        wavesurferRef.current.seekTo(0);
        wavesurferRef.current.setOptions({ 
          waveColor: '#aaa' // Keep waveform color unchanged
        });
      }
      setIsPlaying(false);
      setCurrentTime(0);
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setStatus("Playback finished");
    });

    wavesurfer.on("region-clicked", (region, e) => {
      console.log("REGION-CLICKED event fired:", region);
      e.stopPropagation(); // prevent triggering a click on the waveform
      regionRef.current = region;
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });

    // Also try listening to the regions plugin directly
    regionsPlugin.on("region-updated", (region) => {
      console.log("PLUGIN REGION-UPDATED event fired:", region);
      regionRef.current = region;
      setStartTime(region.start.toFixed(2));
      setEndTime(region.end.toFixed(2));
    });
  };

  // Check if region handles are visible and if drag should be disabled
  const shouldDisableDrag = () => {
    if (!regionRef.current || !wavesurferRef.current) return false;
    
    // Disable drag when zoomed in at all (anything past 1x)
    const isZoomedIn = zoomLevel > 1;
    
    console.log('Drag check:', {
      zoomLevel,
      isZoomedIn,
      shouldDisableDrag: isZoomedIn,
      regionExists: !!regionRef.current,
      wavesurferExists: !!wavesurferRef.current
    });
    
    return isZoomedIn;
  };

  const updateZoom = (newZoomLevel) => {
    if (!wavesurferRef.current) return;

    try {
      setZoomLevel(newZoomLevel);
      
      // Use containerRef instead of wavesurfer.container
      const container = containerRef.current;
      const duration = wavesurferRef.current.getDuration();
      
      if (!container || !container.clientWidth) {
        console.log('Container not ready for zoom, just updating state');
        setStatus(`Zoom level set to ${newZoomLevel.toFixed(1)}x (container not ready)`);
        return;
      }
      
      // Calculate zoom based on container width and duration
      const containerWidth = container.clientWidth;
      const basePxPerSec = containerWidth / duration;
      const newMinPxPerSec = basePxPerSec * newZoomLevel;
      
      console.log('Zoom calculation:', {
        containerWidth,
        duration,
        basePxPerSec,
        newZoomLevel,
        newMinPxPerSec
      });
      
      // Try different zoom methods
      const wavesurfer = wavesurferRef.current;
      if (typeof wavesurfer.zoom === 'function') {
        // Method 1: Use zoom method
        wavesurfer.zoom(newMinPxPerSec);
        setStatus(`Zoomed to ${newZoomLevel.toFixed(1)}x`);
      } else if (typeof wavesurfer.setMinPxPerSec === 'function') {
        // Method 2: Use setMinPxPerSec method
        wavesurfer.setMinPxPerSec(newMinPxPerSec);
        setStatus(`Zoomed to ${newZoomLevel.toFixed(1)}x`);
      } else {
        // Method 3: Try to set minPxPerSec directly and redraw
        try {
          wavesurfer.minPxPerSec = newMinPxPerSec;
          if (typeof wavesurfer.drawBuffer === 'function') {
            wavesurfer.drawBuffer();
          }
          setStatus(`Zoomed to ${newZoomLevel.toFixed(1)}x`);
        } catch (e) {
          console.log('Direct property setting failed:', e);
          setStatus(`Zoom level set to ${newZoomLevel.toFixed(1)}x (zoom not implemented)`);
        }
      }
      
      console.log('Zoom level updated to:', newZoomLevel, 'minPxPerSec:', newMinPxPerSec);
      
    } catch (error) {
      console.error("Error updating zoom:", error);
      setStatus("Error updating zoom: " + error.message);
    }
  };

  const zoomIn = () => {
    console.log("zoomIn called, current zoomLevel:", zoomLevel);
    if (!wavesurferRef.current) {
      console.log("WaveSurfer not ready for zooming");
      setStatus("WaveSurfer not ready for zooming.");
      return;
    }

    const newZoomLevel = Math.min(zoomLevel + 0.5, 5); // Max zoom of 5x, 0.5 increments
    console.log("New zoom level:", newZoomLevel);
    updateZoom(newZoomLevel);
  };

  const zoomOut = () => {
    console.log("zoomOut called, current zoomLevel:", zoomLevel);
    if (!wavesurferRef.current) {
      console.log("WaveSurfer not ready for zooming");
      setStatus("WaveSurfer not ready for zooming.");
      return;
    }

    const newZoomLevel = Math.max(zoomLevel - 0.5, 0.5); // Min zoom of 0.5x, 0.5 increments
    console.log("New zoom level:", newZoomLevel);
    updateZoom(newZoomLevel);
  };

  const handleSliderChange = (e) => {
    const newZoomLevel = parseFloat(e.target.value);
    console.log("Slider changed to:", newZoomLevel);
    updateZoom(newZoomLevel);
  };

  // Temporarily disable the region recreation on zoom to fix drag and playback issues
  // useEffect(() => {
  //   try {
  //     console.log('Zoom useEffect triggered, zoomLevel:', zoomLevel);
  //     
  //     if (!isMountedRef.current) {
  //       console.log('Component not mounted, skipping');
  //       return;
  //     }
  //     
  //     if (regionRef.current && wavesurferRef.current && regionsRef.current) {
  //       console.log('Recreating region with new drag settings');
  //       
  //       // Store current region info
  //       const currentStart = regionRef.current.start;
  //       const currentEnd = regionRef.current.end;
  //       
  //       // Remove existing region
  //       regionRef.current.remove();
  //       
  //       // Recreate region with updated drag settings
  //       const newRegion = regionsRef.current.addRegion({
  //         start: currentStart,
  //         end: currentEnd,
  //         color: "rgba(255, 165, 0, 0.3)",
  //         drag: !shouldDisableDrag(), // Apply current drag settings
  //         resize: true,
  //       });
  //       
  //       regionRef.current = newRegion;
  //       
  //       // Update timestamp inputs
  //       setStartTime(currentStart.toFixed(2));
  //       setEndTime(currentEnd.toFixed(2));
  //       
  //       console.log('Region recreated with drag:', !shouldDisableDrag(), 'at zoom level:', zoomLevel);
  //     } else {
  //       console.log('Required refs not ready:', {
  //         regionRef: !!regionRef.current,
  //         wavesurferRef: !!wavesurferRef.current,
  //         regionsRef: !!regionsRef.current
  //       });
  //     }
  //   } catch (error) {
  //     console.error('Error updating region drag settings:', error);
  //     // Don't crash the site, just log the error
  //   }
  // }, [zoomLevel]);

  const togglePlayback = () => {
    if (!regionRef.current || !wavesurferRef.current) {
      setStatus("No region selected for playback.");
      return;
    }

    try {
      if (isPlaying) {
        // Reset playback to 0 and hide progress bar
        wavesurferRef.current.pause();
        wavesurferRef.current.seekTo(0);
        wavesurferRef.current.setOptions({ 
          progressColor: 'transparent' // Hide progress, keep purple waveform
        });
        
        setIsPlaying(false);
        setCurrentTime(0);
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setStatus("Playback stopped");
      } else {
        // Start playback using WaveSurfer's built-in playback
        const region = regionRef.current;
        const startTime = region.start;
        const endTime = region.end;
        
        // Show blue progress bar during playback, keep purple waveform
        wavesurferRef.current.setOptions({ 
          progressColor: '#70FFEA' // Blue progress bar
        });
        
        // Set WaveSurfer's current time to region start
        wavesurferRef.current.seekTo(startTime / wavesurferRef.current.getDuration());
        
        // Start WaveSurfer playback
        wavesurferRef.current.play();
        
        setIsPlaying(true);
        setStatus("Playing region");
        
        // Set up progress tracking
        setPlaybackStartTime(startTime);
        setCurrentTime(startTime);
        
        // Clear any existing timer
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
        }
        
        // Start custom progress timer
        const startTimeMs = Date.now();
        const regionDuration = endTime - startTime;
        
        progressTimerRef.current = setInterval(() => {
          const elapsed = (Date.now() - startTimeMs) / 1000;
          const newCurrentTime = startTime + elapsed;
          
          if (newCurrentTime >= endTime) {
            // Stop at region end
            wavesurferRef.current.pause();
            wavesurferRef.current.seekTo(0);
            wavesurferRef.current.setOptions({ 
              progressColor: 'transparent' // Hide progress, keep purple waveform
            });
            setIsPlaying(false);
            setCurrentTime(0);
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
            setStatus("Playback finished");
          } else {
            setCurrentTime(newCurrentTime);
          }
        }, 50); // Update every 50ms for smooth progress
      }
    } catch (error) {
      console.error("Error toggling playback:", error);
      setStatus("Error toggling playback: " + error.message);
    }
  };

  const createNewRegion = () => {
    console.log("=== Create New Region clicked ===");
    console.log("Is ready:", isReady);
    console.log("WaveSurfer ref:", wavesurferRef.current);
    console.log("Regions ref:", regionsRef.current);
    console.log("Container ref:", containerRef.current);
    
    if (!wavesurferRef.current) {
      setStatus("Error: WaveSurfer not initialized");
      return;
    }
    
    if (!regionsRef.current) {
      setStatus("Error: Regions plugin not initialized");
      return;
    }
    
    if (!isReady) {
      setStatus("WaveSurfer not ready yet. Please wait.");
      return;
    }
    
    // Check if container exists
    if (!wavesurferRef.current.container) {
      setStatus("Error: WaveSurfer container not ready");
      return;
    }
    
    try {
      // Remove existing region
      if (regionRef.current) {
        console.log("Removing existing region");
        regionRef.current.remove();
      }
      
      // Create new region in the middle of the audio
      const duration = wavesurferRef.current.getDuration();
      console.log("Audio duration:", duration);
      
      const start = Math.max(0, (duration / 2) - 2.5);
      const end = Math.min(duration, (duration / 2) + 2.5);
      
      console.log("Creating region from", start, "to", end);
      
      const newRegion = regionsRef.current.addRegion({
        start: start,
        end: end,
        color: "rgba(135, 206, 250, 0.3)", // Light blue highlight
        drag: !shouldDisableDrag(), // Disable drag if handles not visible
        resize: true,
      });
      
      regionRef.current = newRegion;
      console.log("New region created successfully:", newRegion);
      setStatus("New region created successfully!");
      
      // Update timestamp inputs
      setStartTime(start.toFixed(2));
      setEndTime(end.toFixed(2));
    } catch (error) {
      console.error("Error creating new region:", error);
      setStatus("Error creating new region: " + error.message);
    }
  };

  const updateRegionFromInputs = () => {
    if (!regionRef.current || !regionsRef.current) return;
    
    const start = parseFloat(startTime);
    const end = parseFloat(endTime);
    
    if (isNaN(start) || isNaN(end) || start >= end) {
      setStatus("Invalid timestamps. Start must be less than end.");
      return;
    }
    
    // Check if container exists
    if (!containerRef.current || !wavesurferRef.current) {
      setStatus("Error: WaveSurfer container not ready");
      return;
    }
    
    try {
      // Remove existing region
      regionRef.current.remove();
      
      // Create new region with input timestamps
      const newRegion = regionsRef.current.addRegion({
        start: start,
        end: end,
        color: "rgba(135, 206, 250, 0.3)", // Light blue highlight
        drag: !shouldDisableDrag(), // Disable drag if handles not visible
        resize: true,
      });
      
      regionRef.current = newRegion;
      setStatus("Region updated from timestamps");
    } catch (error) {
      console.error("Error updating region:", error);
      setStatus("Error updating region: " + error.message);
    }
  };

  const updateRegionInRealTime = (newStartTime, newEndTime) => {
    if (!regionRef.current || !regionsRef.current) return;
    
    const start = parseFloat(newStartTime);
    const end = parseFloat(newEndTime);
    
    if (isNaN(start) || isNaN(end) || start >= end) {
      return; // Don't update if invalid
    }
    
    // Check if container exists
    if (!containerRef.current || !wavesurferRef.current) {
      return;
    }
    
    // Clear any existing timeout
    if (window.updateTimeout) {
      clearTimeout(window.updateTimeout);
    }
    
    // Debounce the update to prevent too many rapid changes
    window.updateTimeout = setTimeout(() => {
      try {
        // Remove existing region and create new one for immediate update
        regionRef.current.remove();
        
        const newRegion = regionsRef.current.addRegion({
          start: start,
          end: end,
          color: "rgba(135, 206, 250, 0.3)",
          drag: !shouldDisableDrag(),
          resize: true,
        });
        
        regionRef.current = newRegion;
      } catch (error) {
        console.error("Error updating region in real time:", error);
      }
    }, 100); // 100ms delay
  };

  const handleTrim = async () => {
    console.log("Trim button clicked");
    console.log("Region ref:", regionRef.current);
    console.log("New name:", newName);
    
    if (!regionRef.current) {
      setStatus("No region selected. Please create a region first.");
      return;
    }
    
    if (!newName) {
      setStatus("Please enter a filename.");
      return;
    }
    
    const { start, end } = regionRef.current;
    console.log("Trim region:", { start, end });

    try {
      const requestBody = {
        filename: clip,
        startTime: start.toFixed(2),
        endTime: end.toFixed(2),
        newName,
      };
      
      console.log("Sending request:", requestBody);
      
              const res = await fetch("/api/trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      console.log("Response status:", res.status);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Trim failed');
      }
      
      const data = await res.json();
      console.log("Trim response:", data);
      setStatus(`Trimmed: ${data.filename}`);
      setNewName(""); // Clear the input after successful trim
    } catch (err) {
      console.error("Trim error:", err);
      setStatus(`Trim failed: ${err.message}`);
    }
  };

  // Calculate progress line position based on current time vs total duration, accounting for zoom
  // const progressPosition = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  // When zoomed in, calculate position relative to the visible region
  // const adjustedProgressPosition = (() => {
  //   if (zoomLevel <= 1 || !regionRef.current) {
  //     return progressPosition;
  //   }
  //   
  //   // When zoomed in, show progress relative to the region
  //   const region = regionRef.current;
  //   const regionStart = region.start;
  //   const regionEnd = region.end;
  //   const regionDuration = regionEnd - regionStart;
  //   
  //   // Calculate progress within the region
  //   const progressInRegion = Math.max(0, Math.min(1, (currentTime - regionStart) / regionDuration));
  //   
  //   // Convert to percentage
  //   return progressInRegion * 100;
  // })();
  
  // Calculate the progress bar width and position based on zoom level
  // const progressBarStyle = (() => {
  //   if (zoomLevel <= 1 || !regionRef.current) {
  //     // Normal progress bar spanning full width
  //     return {
  //       left: `${progressPosition}%`,
  //       width: '2px'
  //     };
  //   }
  //   
  //   // When zoomed in, calculate the region's position and width
  //   const region = regionRef.current;
  //   const regionStart = region.start;
  //   const regionEnd = region.end;
  //   const totalDuration = duration;
  //   
  //   // Calculate region position as percentage of total duration
  //   const regionStartPercent = (regionStart / totalDuration) * 100;
  //   const regionEndPercent = (regionEnd / totalDuration) * 100;
  //   const regionWidthPercent = regionEndPercent - regionStartPercent;
  //   
  //   // Calculate progress within the region
  //   const progressInRegion = Math.max(0, Math.min(1, (currentTime - regionStart) / (regionEnd - regionStart)));
  //   
  //   // Position the progress bar within the region
  //   const progressBarLeft = regionStartPercent + (progressInRegion * regionWidthPercent);
  //   
  //   return {
  //     left: `${progressBarLeft}%`,
  //     width: '2px'
  //   };
  // })();
  
  // console.log('Progress calculation:', {
  //   currentTime,
  //   duration,
  //   progressPosition,
  //   zoomLevel,
  //   adjustedProgressPosition,
  //   regionStart: regionRef.current?.start,
  //   regionEnd: regionRef.current?.end,
  //   progressBarStyle
  // });

  const handleDownload = async () => {
    if (!regionRef.current || !wavesurferRef.current) {
      setStatus("No region selected for download.");
      return;
    }

    const region = regionRef.current;
    const start = region.start;
    const end = region.end;

    try {
      setStatus("Processing download...");
      
      // First, save the trimmed file
      const trimRequestBody = {
        filename: clip,
        startTime: start.toFixed(2),
        endTime: end.toFixed(2),
        newName: newName || 'trimmed'
      };

      console.log("Sending trim request:", trimRequestBody);

              const trimRes = await fetch("/api/trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trimRequestBody),
      });

      if (!trimRes.ok) {
        const errorData = await trimRes.json();
        throw new Error(errorData.error || 'Trim failed');
      }

      const trimData = await trimRes.json();
      console.log("Trim successful:", trimData);

      // Now download the saved file
              const downloadRes = await fetch(`/clips/${trimData.filename}`, {
        method: "GET",
      });

      if (!downloadRes.ok) {
        throw new Error('Download failed');
      }

      const blob = await downloadRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${newName || 'trimmed'}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setStatus(`Downloaded: ${a.download}`);
    } catch (err) {
      console.error("Download error:", err);
      setStatus(`Download failed: ${err.message}`);
    }
  };

  const handleReset = () => {
    if (!regionRef.current) {
      setStatus("No region selected to reset.");
      return;
    }

    try {
      regionRef.current.remove();
      const duration = wavesurferRef.current.getDuration();
      const newRegion = regionsRef.current.addRegion({
        start: 0,
        end: duration,
        color: "rgba(135, 206, 250, 0.3)",
        drag: !shouldDisableDrag(),
        resize: true,
      });
      regionRef.current = newRegion;
      setStartTime("0.00");
      setEndTime(duration.toFixed(2));
      setStatus("Region reset to full duration.");
    } catch (error) {
      console.error("Error resetting region:", error);
      setStatus("Error resetting region: " + error.message);
    }
  };

  return (
    <div 
      className="space-y-6"
      style={{
        background: '#14162B',
        borderRadius: '1.5rem',
        padding: '2rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(167, 139, 250, 0.1)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center mr-4"
            style={{
              background: 'linear-gradient(135deg, #A44EFF, #427BFF)'
            }}
          >
            <span className="text-white text-xl">✂️</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Trim Audio: {originalFileName || clip}</h2>
            <p className="text-gray-400 text-sm">
              Drag to move selection, resize edges, or use timestamp inputs below
            </p>
          </div>
        </div>
        
        {/* Play Button in Header */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="px-6 py-3 rounded-xl font-bold text-white transition-all duration-300 transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #A44EFF, #427BFF)',
              boxShadow: '0 4px 15px rgba(164, 78, 255, 0.3)'
            }}
            disabled={!isReady || !regionRef.current}
          >
            ↻
          </button>
          
          <button
            onClick={togglePlayback}
            className="px-6 py-3 rounded-xl font-bold text-white transition-all duration-300 transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #36D1DC, #5B86E5)',
              boxShadow: '0 4px 15px rgba(54, 209, 220, 0.3)'
            }}
            disabled={!isReady || !regionRef.current}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          
          <button
            onClick={handleDownload}
            className="px-6 py-3 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #A44EFF, #427BFF)',
              boxShadow: '0 4px 15px rgba(164, 78, 255, 0.3)'
            }}
          >
            ⬇
          </button>
        </div>
      </div>
      
      {/* Waveform Container */}
      <div 
        className="rounded-xl overflow-hidden"
        style={{
          background: '#1A1C33',
          border: '1px solid rgba(167, 139, 250, 0.2)'
        }}
      >
        <div ref={containerRef} className="w-full" />
      </div>
      
      {/* Controls Section */}
      <div className="flex gap-4">
        {/* Timestamp Controls - Left Side */}
        <div 
          className="flex-1 p-4 rounded-xl"
          style={{
            background: '#1A1C33',
            border: '1px solid rgba(167, 139, 250, 0.2)'
          }}
        >
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300 font-medium">Start Time (s):</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={startTime}
                onChange={(e) => {
                  const newStartTime = e.target.value;
                  setStartTime(newStartTime);
                  updateRegionInRealTime(newStartTime, endTime);
                }}
                className="w-24 p-2 rounded-lg text-white font-mono"
                style={{
                  background: '#1E203A',
                  border: '1px solid rgba(167, 139, 250, 0.3)'
                }}
              />
            </div>
            
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300 font-medium">End Time (s):</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={endTime}
                onChange={(e) => {
                  const newEndTime = e.target.value;
                  setEndTime(newEndTime);
                  updateRegionInRealTime(startTime, newEndTime);
                }}
                className="w-24 p-2 rounded-lg text-white font-mono"
                style={{
                  background: '#1E203A',
                  border: '1px solid rgba(167, 139, 250, 0.3)'
                }}
              />
            </div>
          </div>
        </div>
        
        {/* Zoom Controls - Right Side */}
        <div 
          className="flex-1 p-4 rounded-xl"
          style={{
            background: '#1A1C33',
            border: '1px solid rgba(167, 139, 250, 0.2)'
          }}
        >
          <div className="flex gap-4 items-center">
            <button
              onClick={zoomOut}
              className="px-4 py-2 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #A44EFF, #427BFF)',
                boxShadow: '0 4px 15px rgba(164, 78, 255, 0.3)'
              }}
              disabled={!isReady || !regionRef.current}
            >
              🔍−
            </button>
            
            <button
              onClick={zoomIn}
              className="px-4 py-2 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #A44EFF, #427BFF)',
                boxShadow: '0 4px 15px rgba(164, 78, 255, 0.3)'
              }}
              disabled={!isReady}
            >
              🔍+
            </button>
            
            <div className="flex-1 mx-4">
              <input
                type="range"
                min="1.0"
                max="5"
                step="0.1"
                value={zoomLevel}
                onChange={handleSliderChange}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer zoom-slider"
                style={{
                  background: 'linear-gradient(to right, #A44EFF, #427BFF)',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
                disabled={!isReady}
              />
            </div>
            
            <span className="text-sm text-gray-300 min-w-[60px] font-medium">
              {zoomLevel.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>
      
      {/* Status Message */}
      {status && (
        <div 
          className="p-4 rounded-xl text-center"
          style={{
            background: 'rgba(167, 139, 250, 0.1)',
            border: '1px solid rgba(167, 139, 250, 0.3)'
          }}
        >
          <p className="text-white font-medium">{status}</p>
        </div>
      )}
    </div>
  );
}
