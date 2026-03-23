import { useEffect, useRef, useState } from 'react';
import dgram from 'react-native-udp';

export default function useGlassesNetwork() {
  // --- STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [cameraIP, setCameraIP] = useState<string | null>(null);
  const [displayIP, setDisplayIP] = useState<string | null>(null);
  
  // We'll store incoming images here for the UI
  const [images, setImages] = useState<string[]>([]);
  
  // Keep persistent references to the WebSockets
  const cameraSocketRef = useRef<WebSocket | null>(null);
  const displaySocketRef = useRef<WebSocket | null>(null);

  // --- 1. UDP DISCOVERY ---
  const startScan = () => {
    setIsScanning(true);
    setCameraIP(null);
    setDisplayIP(null);

    const udpSocket = dgram.createSocket('udp4');
    udpSocket.bind(12345); // The port our ESPs will shout on

    udpSocket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        console.log("Found device:", data);

        if (data.role === 'camera_mic' && !cameraIP) {
          setCameraIP(data.ip);
        }
        if (data.role === 'oled_display' && !displayIP) {
          setDisplayIP(data.ip);
        }
      } catch (e) {
        console.log("UDP Parse Error:", e);
      }
    });

    // Auto-stop scanning after 10 seconds if not found
    setTimeout(() => {
      udpSocket.close();
      setIsScanning(false);
    }, 10000);
  };

  // --- 2. CAMERA NODE (ESP-EYE) CONNECTION ---
  useEffect(() => {
    if (!cameraIP) return;
    
    console.log(`Connecting to Vision/Audio Node at ws://${cameraIP}:81`);
    const ws = new WebSocket(`ws://${cameraIP}:81`);
    cameraSocketRef.current = ws;

    ws.onmessage = (event) => {
      const msg = event.data as string;
      
      // For now, we just catch images to test the hardware link
      if (msg.startsWith("IMG:")) {
        const base64 = msg.replace("IMG:", "");
        setImages(prev => [...prev, `data:image/jpeg;base64,${base64}`]);
      } 
      // Audio logic will be added here in Step 3
    };

    ws.onerror = (e) => console.log("Camera Socket Error", e);
    
    return () => ws.close();
  }, [cameraIP]);

  // --- 3. DISPLAY NODE (ESP32-C3) CONNECTION ---
  useEffect(() => {
    if (!displayIP) return;
    
    console.log(`Connecting to Display Node at ws://${displayIP}:81`);
    const ws = new WebSocket(`ws://${displayIP}:81`);
    displaySocketRef.current = ws;

    ws.onerror = (e) => console.log("Display Socket Error", e);

    return () => ws.close();
  }, [displayIP]);

  // --- HELPER: SEND TO OLED ---
  const sendToDisplay = (text: string) => {
    if (displaySocketRef.current && displaySocketRef.current.readyState === WebSocket.OPEN) {
      displaySocketRef.current.send(text);
    }
  };

  // --- DEV MOCK (For testing UI without hardware) ---
  const startScanMock = () => {
    setIsScanning(true);
    setTimeout(() => setCameraIP("192.168.43.5"), 1500);
    setTimeout(() => {
      setDisplayIP("192.168.43.6");
      setIsScanning(false);
    }, 3000);
  };

  return {
    startScan,
    startScanMock,
    isScanning,
    cameraIP,
    displayIP,
    isFullyConnected: !!(cameraIP && displayIP),
    images,
    sendToDisplay
  };
}