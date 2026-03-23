import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import dgram from 'react-native-udp';
import { GeminiLiveService } from '../services/GeminiLiveService';

// ⚠️ Ensure your API key is loaded
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY || "AIzaSyCHv6ffo5SiMdp5Wx7OQL8OtPXpDD0SVJc";

// --- WAV BATCHING UTILITY ---
const createWavFromChunks = (base64Chunks: string[], sampleRate: number = 24000): string => {
  try {
    // 1. Decode and stitch all base64 chunks into one massive binary string
    let combinedPcmBinary = '';
    for (const chunk of base64Chunks) {
      combinedPcmBinary += atob(chunk);
    }

    const dataLength = combinedPcmBinary.length;
    const fileSize = dataLength + 36;
    
    // 2. Build the 44-byte WAV Header
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sampleRate, true); 
    view.setUint32(28, sampleRate * 2, true); 
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // 3. Convert header to binary string
    let headerBinary = '';
    const headerBytes = new Uint8Array(buffer);
    for (let i = 0; i < headerBytes.length; i++) {
      headerBinary += String.fromCharCode(headerBytes[i]);
    }
    
    // 4. Combine and encode to a single Base64 string
    return btoa(headerBinary + combinedPcmBinary);
  } catch (e) {
    console.error("WAV Batching failed:", e);
    return "";
  }
};

interface AppContextType {
  // Network State
  startScan: () => void;
  startScanMock: () => void;
  isScanning: boolean;
  cameraIP: string | null;
  displayIP: string | null;
  isFullyConnected: boolean;
  images: string[];
  
  // Gemini State
  isConnected: boolean;
  status: string;
  userTranscript: string;
  responseText: string;
  
  // Actions
  sendText: (text: string) => void;
  simulateBurst: () => void;
  chatHistory: {id: string, text: string, sender: 'user' | 'bot'}[];
  setChatHistory: React.Dispatch<React.SetStateAction<{id: string, text: string, sender: 'user' | 'bot'}[]>>;
  searchSources: {title: string, uri: string}[];
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  // --- NETWORK STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [cameraIP, setCameraIP] = useState<string | null>(null);
  const [displayIP, setDisplayIP] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const cameraSocketRef = useRef<WebSocket | null>(null);
  const displaySocketRef = useRef<WebSocket | null>(null);

  // --- GEMINI STATE ---
  const geminiServiceRef = useRef<GeminiLiveService | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [userTranscript, setUserTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const [chatHistory, setChatHistory] = useState<{id: string, text: string, sender: 'user' | 'bot'}[]>([]);
  const [searchSources, setSearchSources] = useState<{title: string, uri: string}[]>([]);

  // --- AUDIO QUEUE ---
  const audioQueue = useRef<string[]>([]);
  const isPlaying = useRef(false);

  // 1. Initialize Gemini ONCE when app starts
  useEffect(() => {
    const service = new GeminiLiveService(API_KEY);
    geminiServiceRef.current = service;

    service.on('onConnected', () => { setIsConnected(true); setStatus('Listening'); });
    service.on('onDisconnected', () => { setIsConnected(false); setStatus('Disconnected'); });
    service.on('onTranscript', (text: string) => setUserTranscript(text));
    
    service.on('onTextResponse', (text: string, isThinking: boolean, isDone: boolean) => {
      setResponseText(prev => prev + text);
      setStatus(isThinking ? 'Thinking...' : 'Speaking...');
      
      // Send text to OLED display
      if (displaySocketRef.current?.readyState === WebSocket.OPEN) {
        displaySocketRef.current.send(text);
      }

      // Add this right next to your other service.on() calls
    service.on('onSearchSources', (sources: {title: string, uri: string}[]) => {
      setSearchSources(sources);
    });

      // If turn is complete, push to history and clear active buffer
      if (isDone) {
        setStatus('Done');
        setResponseText(currentText => {
          if (currentText.trim()) {
            setChatHistory(prev => [...prev, { id: Date.now().toString(), text: currentText, sender: 'bot' }]);
          }
          return ''; // clear buffer
        });
        setUserTranscript('');
      }
    });

    service.on('onAudioResponse', (base64Audio: string) => {
      audioQueue.current.push(base64Audio);
      if (!isPlaying.current) processAudioQueue();
    });

    service.connect();
    return () => service.disconnect();
  }, []);

// 2. Audio Processing Logic
  const processAudioQueue = async () => {
    // Only proceed if we aren't currently playing AND we have chunks
    if (isPlaying.current || audioQueue.current.length === 0) return;
    
    // OPTIONAL JITTER BUFFER: Wait until we have at least 3 chunks to prevent micro-stutters
    // (If it still stutters, increase this number to 5 or 8)
    if (audioQueue.current.length < 3) return;

    isPlaying.current = true;

    try {
      // Grab ALL chunks currently waiting in the queue
      const chunksToPlay = [...audioQueue.current];
      audioQueue.current = []; // Clear the queue instantly

      // Stitch them into ONE single WAV file
      const wavData = createWavFromChunks(chunksToPlay, 24000);
      
      if (!wavData) throw new Error("Generated wavData is empty");

      const path = `${FileSystem.cacheDirectory}gemini_live_${Date.now()}.wav`;

      await FileSystem.writeAsStringAsync(path, wavData, { encoding: 'base64' });
      const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });

      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) resolve();
        });
      });

      await sound.unloadAsync();
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch (e) {
      console.error("Playback error:", e);
    } finally {
      isPlaying.current = false;
      // If new chunks arrived while we were playing, fire the queue again
      if (audioQueue.current.length > 0) {
        processAudioQueue();
      }
    }
  };

  // 3. UDP Discovery
  const startScan = () => {
    setIsScanning(true);
    const udpSocket = dgram.createSocket('udp4');
    udpSocket.bind(12345);

    udpSocket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.role === 'camera_mic' && !cameraIP) setCameraIP(data.ip);
        if (data.role === 'oled_display' && !displayIP) setDisplayIP(data.ip);
      } catch (e) {}
    });

    setTimeout(() => { udpSocket.close(); setIsScanning(false); }, 10000);
  };

  // 4. Connect to Camera/Mic ESP & Route to Gemini
  useEffect(() => {
    if (!cameraIP) return;
    const ws = new WebSocket(`ws://${cameraIP}:81`);
    cameraSocketRef.current = ws;

    ws.onmessage = (event) => {
      const msg = event.data as string;
      if (msg.startsWith("IMG:")) {
        const base64 = msg.replace("IMG:", "");
        setImages(prev => [...prev, `data:image/jpeg;base64,${base64}`]);
        geminiServiceRef.current?.sendImage(base64); // Send directly to Gemini!
      } else if (msg.startsWith("AUD:")) {
        const base64 = msg.replace("AUD:", "");
        geminiServiceRef.current?.sendAudio(base64); // Stream mic to Gemini!
      } else if (msg === "END_TURN") {
        geminiServiceRef.current?.sendEndTurn();
      }
    };
    return () => ws.close();
  }, [cameraIP]);

  // 5. Connect to Display ESP
  useEffect(() => {
    if (!displayIP) return;
    const ws = new WebSocket(`ws://${displayIP}:81`);
    displaySocketRef.current = ws;
    return () => ws.close();
  }, [displayIP]);

  // Actions
const sendText = (text: string) => {
    setSearchSources([]); // CLEAR PREVIOUS SEARCH RESULTS
    setChatHistory(prev => [...prev, { id: Date.now().toString(), text, sender: 'user' }]);
    geminiServiceRef.current?.sendText(text);
  };

  const startScanMock = () => {
    setIsScanning(true);
    setTimeout(() => setCameraIP("192.168.43.5"), 1500);
    setTimeout(() => { setDisplayIP("192.168.43.6"); setIsScanning(false); }, 3000);
  };

  const simulateBurst = () => sendText("Tell me a quick joke.");

  return (
    <AppContext.Provider value={{
      startScan, startScanMock, isScanning, cameraIP, displayIP, isFullyConnected: !!(cameraIP && displayIP),
      images, isConnected, status, userTranscript, responseText, sendText, simulateBurst, chatHistory, setChatHistory,
      searchSources
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within an AppProvider");
  return context;
};