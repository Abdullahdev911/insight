import { useEffect, useRef, useState } from 'react';
import useGeminiLive from './useGeminiLive';

export default function useGlassesSocket(ipAddress: string | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [images, setImages] = useState<string[]>([]);
  
  // Use the NEW Gemini Hook API
  const { 
    sendImage, 
    sendAudio, 
    sendEndTurn, 
    ...geminiState 
  } = useGeminiLive();

  // Connect to ESP32
  useEffect(() => {
    if (!ipAddress) return;
    const ws = new WebSocket(`ws://${ipAddress}/ws`);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      const msg = event.data as string;

      // 1. IMAGE RECEIVED (Streamed)
      if (msg.startsWith("IMG:")) {
        const base64 = msg.replace("IMG:", "");
        setImages(prev => [...prev, `data:image/jpeg;base64,${base64}`]);
        
        // Pass to Gemini Immediately using the new helper
        sendImage(base64);
      }

      // 2. AUDIO RECEIVED (Batched at end)
      else if (msg.startsWith("AUD:")) {
        const base64 = msg.replace("AUD:", "");
        
        // Pass to Gemini using the new helper
        // (The Service handles the MIME type internally now)
        sendAudio(base64);
        
        // Signal that we are done sending data
        sendEndTurn();
      }
      
      // 3. START/RESET
      else if (msg.includes("START_SESSION")) {
         setImages([]); // Clear previous session
      }
    };

    return () => ws.close();
  }, [ipAddress]);

  // Simulation Tool (Updated for new API)
  const simulateBurst = () => {
    // 1. Send Fake Image
    // Note: Provide raw base64 without the data URI prefix for the Service
    const mockBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
    
    // Update local UI
    setImages(prev => [...prev, `data:image/jpeg;base64,${mockBase64}`]);
    
    // Send to Gemini
    sendImage(mockBase64); 
    
    // 2. Send Fake Audio after delay
    setTimeout(() => {
       // Tiny silence buffer
       sendAudio("UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAA==");
       sendEndTurn();
    }, 1000);
  };

  return { images, simulateBurst, ...geminiState };
}