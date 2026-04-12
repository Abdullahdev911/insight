import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import dgram from 'react-native-udp';
import { GeminiLiveService } from '../services/GeminiLiveService';

// ⚠️ Ensure your API key is loaded
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY || "AIzaSyCXrUAupjY1CFiVBUC36Ztquv2y8MQ78RE";

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

export interface ChatItem {
  id: string;
  text?: string;
  imageUri?: string;
  sender: 'user' | 'bot';
  timestamp: number;
}

export interface SessionHistoryItem {
  id: string;
  timestamp: number;
  preview: string;
}

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
  chatHistory: ChatItem[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  sessionHistory: SessionHistoryItem[];
  createNewChat: () => Promise<void>;
  loadChat: (id: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  searchSources: { title: string, uri: string }[];
  isLocationEnabled: boolean;
  setIsLocationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
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
  const userTranscriptRef = useRef('');
  const [responseText, setResponseText] = useState('');
  const botResponseRef = useRef('');
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
  const chatHistoryRef = useRef<ChatItem[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const sessionHistoryRef = useRef<SessionHistoryItem[]>([]);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    sessionHistoryRef.current = sessionHistory;
  }, [sessionHistory]);

  const createNewChat = async () => {
    const currentChat = chatHistoryRef.current;
    if (currentChat.length === 0) return;
    try {
      const sessionId = Date.now().toString();
      const preview = currentChat.find(c => c.text)?.text?.substring(0, 30) || "Conversation with Insight";

      const newSession: SessionHistoryItem = { id: sessionId, timestamp: Date.now(), preview };
      const updatedHistory = [newSession, ...sessionHistoryRef.current];

      setSessionHistory(updatedHistory);

      const hsPath = `${FileSystem.documentDirectory}session_history.json`;
      await FileSystem.writeAsStringAsync(hsPath, JSON.stringify(updatedHistory));

      const chatPath = `${FileSystem.documentDirectory}chat_${sessionId}.json`;
      await FileSystem.writeAsStringAsync(chatPath, JSON.stringify(currentChat));

      // Clear current active feed
      setChatHistory([]);
      setUserTranscript('');
      userTranscriptRef.current = '';
      setResponseText('');
      botResponseRef.current = '';
      setImages([]);
      setSearchSources([]);
    } catch (e) {
      console.error("Failed to save session", e);
    }
  };
  const [searchSources, setSearchSources] = useState<{ title: string, uri: string }[]>([]);
  const [isLocationEnabled, setIsLocationEnabled] = useState(false);
  const locationEnabledRef = useRef(false);
  const lastLocationRef = useRef<{ latitude: number, longitude: number } | null>(null);

  useEffect(() => {
    // Load session history on mount
    const loadArchive = async () => {
      try {
        const path = `${FileSystem.documentDirectory}session_history.json`;
        const exists = await FileSystem.getInfoAsync(path);
        if (exists.exists) {
          const data = await FileSystem.readAsStringAsync(path);
          setSessionHistory(JSON.parse(data));
        }
      } catch (e) {
        console.error("Failed to load session history", e);
      }
    };
    loadArchive();
  }, []);

  useEffect(() => {
    locationEnabledRef.current = isLocationEnabled;
    if (isLocationEnabled) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          }
        } catch (e) {
          console.log("Background location fetch failed:", e);
        }
      })();
    } else {
      lastLocationRef.current = null;
    }
  }, [isLocationEnabled]);

  // --- AUDIO QUEUE ---
  const audioQueue = useRef<string[]>([]);
  const isPlaying = useRef(false);

  // 1. Initialize Gemini ONCE when app starts
  useEffect(() => {
    const service = new GeminiLiveService(API_KEY);
    geminiServiceRef.current = service;

    // ✅ FIX 2: All service.on() calls at the same level — none nested inside others
    service.on('onConnected', () => { 
      setIsConnected(true); 
      setStatus('Listening'); 
      createNewChat(); // Auto-save and clear UI to align with new Gemini Context initialization
    });
    service.on('onDisconnected', () => { 
      setIsConnected(false); 
      setStatus('Disconnected'); 
    });
    service.on('onTranscript', (text: string) => {
      userTranscriptRef.current += text;
      setUserTranscript(userTranscriptRef.current);
    });

    service.on('onSearchSources', (sources: { title: string; uri: string }[]) => {
      setSearchSources(sources);
    });

    service.on('onTextResponse', (text: string, isThinking: boolean, isDone: boolean) => {
      if (isDone) {
        setStatus('Done');

        const finalTranscript = userTranscriptRef.current;
        const finalBotResponse = botResponseRef.current;

        setChatHistory(prev => {
          let newHistory = [...prev];
          if (finalTranscript.trim()) {
            newHistory.push({ id: Date.now().toString() + '_user', text: finalTranscript, sender: 'user', timestamp: Date.now() });
          }
          if (finalBotResponse.trim()) {
            newHistory.push({ id: Date.now().toString() + '_bot', text: finalBotResponse, sender: 'bot', timestamp: Date.now() });
          }
          return newHistory;
        });

        // Clear references
        setResponseText('');
        botResponseRef.current = '';
        setUserTranscript('');
        userTranscriptRef.current = '';

        // Force flush any remaining audio chunks at the end of the turn
        processAudioQueue(true);
      } else {
        botResponseRef.current += text;
        setResponseText(botResponseRef.current);
        setStatus(isThinking ? 'Thinking...' : 'Speaking...');

        if (displaySocketRef.current?.readyState === WebSocket.OPEN) {
          displaySocketRef.current.send(text);
        }
      }
    });

    service.on('onAudioResponse', (base64Audio: string) => {
      audioQueue.current.push(base64Audio);
      if (!isPlaying.current) processAudioQueue();
    });

    service.on('onToolCall', async (toolCall: any) => {
      if (!toolCall.functionCalls) return;

      const responses: any[] = [];
      for (const call of toolCall.functionCalls) {
        if (call.name === 'fetchCurrentLocation') {
          if (!locationEnabledRef.current) {
            responses.push({
              id: call.id,
              name: call.name,
              response: { result: { error: "Location access disabled in settings. Ask the user to enable it in Settings." } }
            });
            continue;
          }
          try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              responses.push({ id: call.id, name: call.name, response: { result: { error: "OS Location permission denied." } } });
              continue;
            }
            let location = await Location.getCurrentPositionAsync({});
            responses.push({
              id: call.id,
              name: call.name,
              response: { result: { latitude: location.coords.latitude, longitude: location.coords.longitude } }
            });
          } catch (e) {
            responses.push({ id: call.id, name: call.name, response: { result: { error: "Failed to get GPS location." } } });
          }
        }
      }
      if (responses.length > 0) {
        service.sendToolResponse(responses);
      }
    });

    // service.connect();
    return () => service.disconnect();
  }, []);

  // 2. Audio Processing Logic
  const processAudioQueue = async (flush = false) => {
    // Only proceed if we aren't currently playing AND we have chunks
    if (isPlaying.current || audioQueue.current.length === 0) return;

    // OPTIONAL JITTER BUFFER: Wait until we have at least 2 chunks to prevent micro-stutters
    // If flush is true, bypass the buffer to play whatever is left at the end of the sentence.
    if (!flush && audioQueue.current.length < 2) return;

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
        processAudioQueue(flush);
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
        const str = msg.toString();
        console.log("📡 UDP Heard:", str); // Look at your terminal when this runs!

        const data = JSON.parse(str);
        if (data.role === 'camera_mic') setCameraIP(prev => prev || data.ip);
        if (data.role === 'oled_display') setDisplayIP(prev => prev || data.ip);
      } catch (e) {
        console.error("❌ UDP Parse Error:", e, msg.toString());
      }
    });

    setTimeout(() => {
      try { udpSocket.close(); } catch (e) { }
      setIsScanning(false);
    }, 30000);
  };

  // 4. Connect to Camera/Mic ESP & Route to Gemini
  useEffect(() => {
    if (!cameraIP) return;
    const ws = new WebSocket(`ws://${cameraIP}:81`);
    cameraSocketRef.current = ws;

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const msg = event.data as string;

      // 🚨 NEW: Intercept Hardware Commands
      if (msg === "CMD:WAKE") {
        console.log("⏰ ESP32 Wake Word Detected! Connecting to Gemini...");
        if (displaySocketRef.current?.readyState === WebSocket.OPEN) {
          displaySocketRef.current.send("CMD:CLEAR");
        }
        geminiServiceRef.current?.connect(lastLocationRef.current || undefined);
      }
      else if (msg === "CMD:SLEEP") {
        console.log("💤 ESP32 Sleep Command. Terminating Gemini Session.");
        geminiServiceRef.current?.disconnect();
      }

     // Standard Data Forwarding (Only works if Gemini is connected!)
      else if (msg.startsWith("IMG:")) {
        let base64 = msg.replace("IMG:", "");
        
        // 🚨 FIX 1: The UI Shield. React Native's <Image> component will silently 
        // fail if the string isn't perfectly padded. Clean and pad it here!
        base64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
        while (base64.length % 4 !== 0) { base64 += "="; }

        if (geminiServiceRef.current?.isConnected) {
          // Use a random string to guarantee unique keys for the FlatList
          const uniqueId = 'img_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);

          setChatHistory(prev => [...prev, {
            id: uniqueId,
            imageUri: `data:image/jpeg;base64,${base64}`,
            sender: 'user',
            timestamp: Date.now()
          }]);
          
          setImages(prev => [...prev, `data:image/jpeg;base64,${base64}`]);
          geminiServiceRef.current.sendImage(base64); 
        }
      }
      else if (msg.startsWith("AUD:")) {
        const base64 = msg.replace("AUD:", "");
        geminiServiceRef.current?.sendAudio(base64);
      }
    };
  }, [cameraIP]);

  // 5. Connect to Display ESP
  useEffect(() => {
    if (!displayIP) return;
    const ws = new WebSocket(`ws://${displayIP}:81`);
    displaySocketRef.current = ws;
    // REMOVED: return () => ws.close();
  }, [displayIP]);

  // Actions
  // Actions
  const sendText = (text: string) => {
    setSearchSources([]); // CLEAR PREVIOUS SEARCH RESULTS
    setChatHistory(prev => [...prev, { id: Date.now().toString(), text, sender: 'user', timestamp: Date.now() }]);
    
    const service = geminiServiceRef.current;
    if (!service) return;

    // If already connected, send immediately
    if (service.isConnected) {
      service.sendText(text);
    } else {
      // If asleep, wake it up!
      console.log("⏰ App Text Input Detected! Waking up Gemini...");
      service.connect(lastLocationRef.current || undefined);

      // Wait for the WebSocket handshake to finish before sending the text
      let attempts = 0;
      const waitForConnection = setInterval(() => {
        attempts++;
        if (service.isConnected) {
          service.sendText(text);
          clearInterval(waitForConnection);
        } else if (attempts > 50) {
          // Timeout after 5 seconds so we don't loop forever if WiFi dies
          console.error("❌ Failed to connect to Gemini to send text.");
          clearInterval(waitForConnection);
        }
      }, 100); // Check connection status every 100ms
    }
  };

  const startScanMock = () => {
    setIsScanning(true);
    setTimeout(() => setCameraIP("192.168.43.5"), 1500);
    setTimeout(() => { setDisplayIP("192.168.43.6"); setIsScanning(false); }, 3000);
  };

  const simulateBurst = () => sendText("Tell me a quick joke.");

  const loadChat = async (id: string) => {
    try {
      const chatPath = `${FileSystem.documentDirectory}chat_${id}.json`;
      const exists = await FileSystem.getInfoAsync(chatPath);
      if (exists.exists) {
        const data = await FileSystem.readAsStringAsync(chatPath);
        setChatHistory(JSON.parse(data));
      }
    } catch (e) {
      console.error("Failed to load chat", e);
    }
  };

  const deleteChat = async (id: string) => {
    try {
      const chatPath = `${FileSystem.documentDirectory}chat_${id}.json`;
      const exists = await FileSystem.getInfoAsync(chatPath);
      if (exists.exists) {
        await FileSystem.deleteAsync(chatPath);
      }

      const updatedHistory = sessionHistory.filter(session => session.id !== id);
      setSessionHistory(updatedHistory);

      const hsPath = `${FileSystem.documentDirectory}session_history.json`;
      await FileSystem.writeAsStringAsync(hsPath, JSON.stringify(updatedHistory));
    } catch (e) {
      console.error("Failed to delete chat", e);
    }
  };

  return (
    <AppContext.Provider value={{
      startScan, startScanMock, isScanning, cameraIP, displayIP, isFullyConnected: !!(cameraIP && displayIP),
      images, isConnected, status, userTranscript, responseText, sendText, simulateBurst, chatHistory, setChatHistory,
      sessionHistory, createNewChat, loadChat, deleteChat,
      searchSources, isLocationEnabled, setIsLocationEnabled
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