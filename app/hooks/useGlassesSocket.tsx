// hooks/useGlassesSocket.ts
import { useCallback, useEffect, useRef, useState } from 'react';

interface StreamState {
  isConnected: boolean;
  isStreaming: boolean;
  statusMessage: string;
  images: string[];
  audioData: string | null;
}

export default function useGlassesSocket(ipAddress: string | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<StreamState>({
    isConnected: false,
    isStreaming: false,
    statusMessage: "Waiting for connection...",
    images: [],
    audioData: null,
  });

  // 1. Decoupled Message Processor (The Brain)
  // This function handles data whether it comes from Real WiFi OR the Simulator
  const processIncomingData = useCallback((msg: string) => {
    // A. Control Messages (JSON)
    if (msg.startsWith("{")) {
        try {
            const data = JSON.parse(msg);
            if (data.event === "START_STREAM") {
                console.log("Stream Started");
                setState(prev => ({ 
                    ...prev, 
                    isStreaming: true, 
                    images: [], 
                    audioData: null,
                    statusMessage: "receiving_data" 
                }));
            } 
            else if (data.event === "END_STREAM") {
                console.log("Stream Finished");
                setState(prev => ({ ...prev, isStreaming: false, statusMessage: "processing_ai" }));
                // TRIGGER AI HERE
            }
        } catch (e) {
            console.warn("JSON Parse Error", e);
        }
    } 
    // B. Image Data (Protocol: "IMG:<Base64>")
    else if (msg.startsWith("IMG:")) {
        const base64Image = msg.replace("IMG:", "");
        const imageUri = `data:image/jpeg;base64,${base64Image}`;
        
        setState(prev => ({
            ...prev,
            images: [...prev.images, imageUri] 
        }));
    }
    // C. Audio Data (Protocol: "AUD:<Base64>")
    else if (msg.startsWith("AUD:")) {
        const base64Audio = msg.replace("AUD:", "");
        setState(prev => ({ ...prev, audioData: base64Audio }));
    }
  }, []);

  // 2. Real Connection Logic
  const connect = () => {
    if (!ipAddress) return;

    // console.log(`Connecting to ws://${ipAddress}/ws ...`);
    const ws = new WebSocket(`ws://${ipAddress}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket Connected");
      setState(prev => ({ ...prev, isConnected: true, statusMessage: "Connected" }));
      ws.send("Client Ready");
    };

    ws.onclose = () => {
      // console.log("WebSocket Disconnected");
      setState(prev => ({ ...prev, isConnected: false, statusMessage: "Disconnected" }));
    };

    ws.onerror = (e) => {
      // console.log("WebSocket Error", e);
      setState(prev => ({ ...prev, statusMessage: "Connection Error" }));
    };

    ws.onmessage = (event) => {
        processIncomingData(event.data as string);
    };
  };

  const disconnect = () => {
    socketRef.current?.close();
  };

  // 3. DEBUG TOOL: Simulate Burst (Works even if socket is dead!)
  const simulateBurst = () => {
    console.log("--- SIMULATING BURST ---");
    
    // 1. Manually call the processor with "START"
    processIncomingData(JSON.stringify({ event: "START_STREAM" }));

    // 2. Loop to simulate images arriving
    let count = 0;
    const interval = setInterval(() => {
        count++;
        // Use a tiny transparent pixel for testing
        const mockImg = "IMG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k="; 
        
        processIncomingData(mockImg); // <--- Direct call, bypassing socket

        if (count >= 3) {
            clearInterval(interval);
            // 3. Simulate Audio & End
            setTimeout(() => {
                processIncomingData("AUD:UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAA==");
                processIncomingData(JSON.stringify({ event: "END_STREAM" }));
            }, 500);
        }
    }, 800); // 800ms delay between frames to see the animation
  };

  useEffect(() => {
    if (ipAddress) connect();
    return () => disconnect();
  }, [ipAddress]);

  return { ...state, simulateBurst };
}