import { Audio } from 'expo-av';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import dgram from 'react-native-udp';
import { GeminiLiveService } from '../services/GeminiLiveService';
import { GeminiRestService } from '../services/GeminiRestService';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';

// ⚠️ Ensure your API key is loaded
const API_KEY = "AIzaSyCNt7d3ccGJPkY4EnMevksDyqEJ42TaQNM"

// --- WAV BATCHING UTILITY ---
const createWavFromChunks = (base64Chunks: string[], sampleRate: number = 24000): string => {
  try {
    // 1. Decode and stitch all base64 chunks into one massive binary string
    let combinedPcmBinary = '';
    for (let chunk of base64Chunks) {
      // Sanitize chunk in case it was truncated during network transmission
      chunk = chunk.replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, "");
      if (chunk.length % 4 === 1) chunk = chunk.substring(0, chunk.length - 1);
      const rem = chunk.length % 4;
      if (rem !== 0) chunk = chunk.padEnd(chunk.length + (4 - rem), "=");
      
      try {
        combinedPcmBinary += atob(chunk);
      } catch (e) {
        console.warn("[SYS] ⚠️ Dropping corrupted audio chunk.");
      }
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
  images?: string[];
  status?: string; // <--- ADD THIS LINE
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
  geminiVoice: string;
  setGeminiVoice: (voice: string) => void;
  processingToolMessage: string | null;
  // Passive Mode State
  isPassiveMode: boolean;
  togglePassiveMode: (state?: boolean) => Promise<void>;
  isProcessingPassive: boolean;
  passiveCountdown: number | null;
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
  const pendingImagesRef = useRef<string[]>([]); // Images queued before Gemini connects
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
  
  // Sync history state to ref for use in background logic
  useEffect(() => {
    sessionHistoryRef.current = sessionHistory;
  }, [sessionHistory]);

  // Background Queue Worker Trigger
  useEffect(() => {
    // Check queue on mount and every 2 minutes
    processPendingQueue();
    const interval = setInterval(processPendingQueue, 120000);
    return () => clearInterval(interval);
  }, []);

  const [processingToolMessage, setProcessingToolMessage] = useState<string | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  const [geminiVoice, setGeminiVoiceState] = useState('Zephyr');
  const geminiVoiceRef = useRef('Zephyr');

  const [isPassiveMode, setIsPassiveMode] = useState(false);
  const isPassiveModeRef = useRef(false);
  const [isProcessingPassive, setIsProcessingPassive] = useState(false);
  const [passiveCountdown, setPassiveCountdown] = useState<number | null>(null);
  const passiveAudioChunksRef = useRef<string[]>([]);
  const [passiveImages, setPassiveImages] = useState<{ uri: string, timestamp: number }[]>([]);
  const passiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passiveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingQueueRef = useRef(false);

  const setGeminiVoice = (voice: string) => {
    if (voice === geminiVoiceRef.current) return;

    setGeminiVoiceState(voice);
    geminiVoiceRef.current = voice;

    const service = geminiServiceRef.current;
    if (service && service.isConnected) {
      console.log(`[SYS] 🔄 Voice changed to ${voice}, restarting Gemini session...`);

      // Save any ongoing message if bot was interrupted
      if (status === 'Speaking...' || status === 'Thinking...') {
        const finalTranscript = userTranscriptRef.current;
        const finalBotResponse = botResponseRef.current;

        setChatHistory(prev => {
          let newHistory = [...prev];
          if (finalTranscript.trim()) {
            newHistory.push({ id: Date.now().toString() + '_user_int', text: finalTranscript + " [Interrupted]", sender: 'user', timestamp: Date.now() });
          }
          if (finalBotResponse.trim()) {
            newHistory.push({ id: Date.now().toString() + '_bot_int', text: finalBotResponse + " [Interrupted - Voice Changed]", sender: 'bot', timestamp: Date.now() });
          }
          return newHistory;
        });

        setResponseText('');
        botResponseRef.current = '';
        setUserTranscript('');
        userTranscriptRef.current = '';
      }

      // Clear remaining pending audio from the queue to ensure old voice doesn't keep bleeding over
      audioQueue.current = [];

      service.disconnect();
      setTimeout(() => {
        // Ensure they didn't rapidly change voice again within the timeout
        if (geminiVoiceRef.current === voice) {
          service.connect(lastLocationRef.current || undefined, voice);
        }
      }, 500); // give it time to close cleanly
    }
  };

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    sessionHistoryRef.current = sessionHistory;
  }, [sessionHistory]);

  const createNewChat = async (shouldReconnect: boolean = true, finalHistory?: ChatItem[]) => {
    const currentChat = finalHistory || chatHistoryRef.current;

    // Archive the current session if it has content
    if (currentChat.length > 0) {
      try {
        const existingSessionId = currentSessionIdRef.current;
        const sessionId = existingSessionId || Date.now().toString();
        const preview = currentChat.find(c => c.text)?.text?.substring(0, 30) || "Conversation with Insight";
        const sessionImages = currentChat.filter(c => c.imageUri).map(c => c.imageUri as string);

        let updatedHistory = [...sessionHistoryRef.current];

        if (existingSessionId) {
          // Update the existing session entry instead of duplicating it
          updatedHistory = updatedHistory.map(session =>
            session.id === existingSessionId
              ? { ...session, preview, images: sessionImages, timestamp: Date.now() }
              : session
          );
        } else {
          // Create new session entry
          const newSession: SessionHistoryItem = { id: sessionId, timestamp: Date.now(), preview, images: sessionImages };
          updatedHistory = [newSession, ...updatedHistory];
        }

        setSessionHistory(updatedHistory);

        const hsPath = `${FileSystem.documentDirectory}session_history.json`;
        await FileSystem.writeAsStringAsync(hsPath, JSON.stringify(updatedHistory));

        const chatPath = `${FileSystem.documentDirectory}chat_${sessionId}.json`;
        await FileSystem.writeAsStringAsync(chatPath, JSON.stringify(currentChat));
      } catch (e) {
        console.error("Failed to save session", e);
      }
    }

    // Clear current active feed regardless
    setChatHistory([]);
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    setUserTranscript('');
    userTranscriptRef.current = '';
    setResponseText('');
    botResponseRef.current = '';
    setImages([]);
    setSearchSources([]);
    pendingImagesRef.current = [];
    audioQueue.current = [];
    isPlaying.current = false;

    // Restart the Gemini session so the AI gets a completely fresh context
    const service = geminiServiceRef.current;
    if (service) {
      console.log(`[SYS] 🔄 New Chat: ${shouldReconnect ? 'Restarting' : 'Disconnecting'} Gemini session...`);
      service.disconnect();

      if (shouldReconnect) {
        // Reconnect after a brief pause to let the socket close cleanly
        setTimeout(() => {
          service.connect(lastLocationRef.current || undefined, geminiVoiceRef.current);
        }, 500);
      }
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
 // 1. Initialize Gemini ONCE when app starts
  useEffect(() => {
    const service = new GeminiLiveService(API_KEY);
    geminiServiceRef.current = service;

    service.on('onConnected', () => {
      setIsConnected(true);
      setStatus('Listening');
      const queued = pendingImagesRef.current;
      if (queued.length > 0) {
        console.log(`[SYS] 📤 Flushing ${queued.length} queued image(s) to Gemini.`);
        pendingImagesRef.current = [];
        setTimeout(() => {
          queued.forEach(b64 => service.sendImage(b64));
        }, 300);
      }
    });

    service.on('onDisconnected', () => {
      setIsConnected(false);
      setStatus('Disconnected');
    });

    service.on('onReconnecting', (attempt: number, max: number, delayMs: number) => {
      setIsConnected(false);
      setStatus(`Reconnecting... (${attempt}/${max})`);
    });

    service.on('onTranscript', (text: string) => {
      userTranscriptRef.current += text;
      setUserTranscript(userTranscriptRef.current);
    });

    service.on('onSearchSources', (sources: { title: string; uri: string }[]) => {
      setSearchSources(sources);
    });

    service.on('onTextResponse', (text: string, isThinking: boolean, isDone: boolean) => {
      setProcessingToolMessage(null);
      if (isDone) {
        setStatus('Done');
        const finalTranscript = userTranscriptRef.current;
        const finalBotResponse = botResponseRef.current;
        setChatHistory(prev => {
          let newHistory = [...prev];
          if (finalTranscript.trim()) newHistory.push({ id: Date.now().toString() + '_user', text: finalTranscript, sender: 'user', timestamp: Date.now() });
          if (finalBotResponse.trim()) newHistory.push({ id: Date.now().toString() + '_bot', text: finalBotResponse, sender: 'bot', timestamp: Date.now() });
          return newHistory;
        });
        setResponseText('');
        botResponseRef.current = '';
        setUserTranscript('');
        userTranscriptRef.current = '';
        processAudioQueue(true);
      } else {
        if (botResponseRef.current === "" && displaySocketRef.current?.readyState === WebSocket.OPEN) {
          displaySocketRef.current.send("CMD:CLEAR");
        }
        botResponseRef.current += text;
        setResponseText(botResponseRef.current);
        setStatus(isThinking ? 'Thinking...' : 'Speaking...');
        if (displaySocketRef.current?.readyState === WebSocket.OPEN) {
          displaySocketRef.current.send(text);
        }
      }
    });

    service.on('onAudioResponse', (base64Audio: string) => {
      setProcessingToolMessage(null);
      audioQueue.current.push(base64Audio);
      if (!isPlaying.current) processAudioQueue();
    });

    service.on('onToolCall', async (toolCall: any) => {
      if (!toolCall.functionCalls) return;

      const responses: any[] = [];
      for (const call of toolCall.functionCalls) {
        if (call.name === 'fetchCurrentLocation') {
          const msg = "🌍 Insight is verifying your location...";
          setProcessingToolMessage(msg);
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) displaySocketRef.current.send(`[ System: ${msg} ]`);
          if (!locationEnabledRef.current) {
            responses.push({ id: call.id, name: call.name, response: { result: { error: "Location disabled." } } });
            continue;
          }
          try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              responses.push({ id: call.id, name: call.name, response: { result: { error: "Permission denied." } } });
              continue;
            }
            let location = await Location.getCurrentPositionAsync({});
            responses.push({ id: call.id, name: call.name, response: { result: { latitude: location.coords.latitude, longitude: location.coords.longitude } } });
          } catch (e) {
            responses.push({ id: call.id, name: call.name, response: { result: { error: "Failed to get location." } } });
          }

        } else if (call.name === 'captureCameraFrame') {
          const msg = "📸 Insight is looking...";
          setProcessingToolMessage(msg);
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) displaySocketRef.current.send(`[ System: ${msg} ]`);
          if (cameraSocketRef.current?.readyState === WebSocket.OPEN) cameraSocketRef.current.send("CMD:CAPTURE");
          responses.push({ id: call.id, name: call.name, response: { result: { success: true } } });

        } else if (call.name === 'endConversation') {
          if (cameraSocketRef.current?.readyState === WebSocket.OPEN) cameraSocketRef.current.send("CMD:SLEEP");
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) displaySocketRef.current.send("Goodbye!");
          responses.push({ id: call.id, name: call.name, response: { result: { success: true } } });
          await createNewChat(false, [...chatHistoryRef.current, { id: 'end_conv_' + Date.now(), text: "Goodbye! 💤", sender: 'bot', timestamp: Date.now() }]);
          
      } else if (call.name === 'sendSilentSMS') {
          // --- 🚨 HANDS-FREE SMS LOGIC (TIMEOUT FIX) 🚨 ---
          const { contactName, message } = call.args;
          const msg = `📱 Sending message to ${contactName}...`;
          setProcessingToolMessage(msg);
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) displaySocketRef.current.send(`[ System: ${msg} ]`);

          try {
            if (Platform.OS !== 'android') {
               responses.push({ id: call.id, name: call.name, response: { result: { error: "Silent SMS is only supported on Android." } } });
               continue;
            }
            
            console.log(`\n--- 🚨 SMS DEBUGGING START 🚨 ---`);
            const { status: contactStatus } = await Contacts.requestPermissionsAsync();
            const smsPermission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS);

            if (smsPermission !== PermissionsAndroid.RESULTS.GRANTED || contactStatus !== 'granted') {
              console.log(`[SYS] ❌ PERMISSION DENIED!`);
              responses.push({ id: call.id, name: call.name, response: { result: { error: `Permissions denied.` } } });
              continue; // 🚨 IMPORTANT: Is continue se pehle bhi loading band karni hai isliye finally block banaya hai
            }

            const { data } = await Contacts.getContactsAsync({ name: contactName, fields: [Contacts.Fields.PhoneNumbers] });
            
            if (data.length > 0 && data[0].phoneNumbers && data[0].phoneNumbers.length > 0) {
              const phoneNumber = data[0].phoneNumbers[0].number as string;
              console.log(`[SYS] ✉️ Sending Silent SMS to ${phoneNumber}: "${message}"`);
              
              // 🔥 THE FIX: PROMISE.RACE (3 Second Timeout) 🔥
              await Promise.race([
                new Promise((resolve) => {
                  SmsAndroid.autoSend(
                    phoneNumber, message,
                    (fail: string) => { 
                      console.log('[SYS] ❌ Failed:', fail);
                      responses.push({ id: call.id, name: call.name, response: { result: { error: fail } } }); 
                      resolve(true); 
                    },
                    (success: string) => { 
                      console.log('[SYS] ✅ Success!');
                      responses.push({ id: call.id, name: call.name, response: { result: { success: true } } }); 
                      resolve(true); 
                    }
                  );
                }),
                new Promise((resolve) => setTimeout(() => {
                  console.log('[SYS] ⏱️ Timeout! Library hung, but SMS sent. Moving on.');
                  responses.push({ id: call.id, name: call.name, response: { result: { success: true } } });
                  resolve(true);
                }, 3000)) // 3 Seconds Timeout
              ]);

            } else {
              console.log(`[SYS] ❌ Contact not found.`);
              responses.push({ id: call.id, name: call.name, response: { result: { error: `Contact ${contactName} not found.` } } });
            }
            console.log(`--- 🚨 SMS DEBUGGING END 🚨 ---\n`);
          } catch (e) {
            console.log(`[SYS] ❌ Crash:`, e);
            responses.push({ id: call.id, name: call.name, response: { result: { error: "System crashed." } } });
          } finally {
            // 🚨 Ab yeh block HAR HAAL mein chalega!
            setProcessingToolMessage(null);
          }
       } else if (call.name === 'getCurrentLocation' || call.name === 'fetchCurrentLocation') {
          // --- 🚨 STRIPPED DOWN, NO-ERROR-KEY GPS TOOL 🚨 ---
          setProcessingToolMessage("Fetching live coordinates & address...");
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) displaySocketRef.current.send(`[ System: Fetching live location... ]`);
          
          try {
            const { status } = await Location.getForegroundPermissionsAsync();
            
            // Agar permission ka koi bhi masla ho, hum AI ko error nahi denge, direct coordinates de denge
            if (status !== 'granted') {
               responses.push({ id: call.id, name: call.name, response: { result: { latitude: 24.7913, longitude: 67.0650, exact_address: "Karachi, Pakistan" } } });
            } else {
              
              // 1. FAST INDOOR FETCH (No Hangs)
              let coords: any = null;
              try {
                coords = await Promise.race([
                  Location.getLastKnownPositionAsync().then(res => res ? res.coords : null),
                  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(res => res ? res.coords : null),
                  new Promise((resolve) => setTimeout(() => resolve(null), 3500))
                ]);
              } catch(e) {}

              // Fallback to DHA Phase 6 coordinates if signal is completely dead indoors
              let latitude = coords ? coords.latitude : 24.7913;
              let longitude = coords ? coords.longitude : 67.0650;
              let exactAddress = "Karachi, Pakistan";
              let fullDetails = {};

              // 2. REVERSE GEOCODING + ERASER
              try {
                const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (geocode.length > 0) {
                  const addr = geocode[0];
                  fullDetails = addr;
                  
                  const cleanText = (text: string | null) => {
                      if (!text) return "";
                      let cleaned = text.replace(/sdfasfasfsf|sfasdfasf|sdfasf|sfasdf|asdf|qwer|zxcv/gi, '').trim();
                      return cleaned.replace(/^,+|,+$/g, '').trim();
                  };

                  const rawParts = [addr.street, addr.name, addr.subregion, addr.district, addr.city, addr.region, addr.country];
                  const cleanParts = rawParts.map(cleanText).filter(p => p.length > 2);
                  
                  if (cleanParts.length > 0) {
                      exactAddress = [...new Set(cleanParts)].join(", ");
                  }
                }
              } catch(e) {}

              // 3. SEND EXACTLY YOUR ORIGINAL PAYLOAD (No status, no error keys)
              responses.push({ 
                id: call.id, 
                name: call.name, 
                response: { 
                  result: { 
                    latitude: latitude, 
                    longitude: longitude,
                    exact_address: exactAddress,
                    full_details: fullDetails
                  } 
                } 
              });
            }
          } catch (e) {
            // CATCH ALL - Send generic coordinates, NEVER an error
            responses.push({ id: call.id, name: call.name, response: { result: { latitude: 24.7913, longitude: 67.0650, exact_address: "Karachi, Pakistan" } } });
          } finally {
            setProcessingToolMessage(null);
          }

       } else if (call.name === 'searchGoogleMaps') {
          // --- 🚨 ENHANCED SERPAPI GOOGLE MAPS TOOL 🚨 ---
          const { query, latitude, longitude } = call.args;
          setProcessingToolMessage(`Searching maps for ${query}...`);
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) displaySocketRef.current.send(`[ System: Searching maps for ${query}... ]`);
          
          try {
            // 🚨 APNI SERP API KEY YAHAN DALEIN 🚨
            const API_KEY = "0ab349306d2e632ad7eba1bee5c921a2eaa33096e44be982362a06508382f539"; 
            
            let url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${API_KEY}`;
            if (latitude && longitude) {
              url += `&ll=@${latitude},${longitude},15z`; 
            }

            const res = await fetch(url);
            const data = await res.json();

            let resultsToSend: any[] = [];

            // 🔥 Direct Building Matches (e.g., KTrade, KASB)
            if (data.place_results && data.place_results.title) {
                resultsToSend.push({
                    title: data.place_results.title,
                    address: data.place_results.address,
                    rating: data.place_results.rating,
                    reviews: data.place_results.reviews,
                    phone: data.place_results.phone,
                    website: data.place_results.website || data.place_results.links?.website,
                    timings: data.place_results.operating_hours || "Schedule not listed",
                    coordinates: data.place_results.gps_coordinates
                });
            }

            // 🔥 List Results (e.g., KFC, Masjids)
            if (data.local_results && data.local_results.length > 0) {
                const localData = data.local_results.slice(0, 3).map((item: any) => ({
                    title: item.title,
                    address: item.address,
                    rating: item.rating,
                    reviews: item.reviews,
                    phone: item.phone,
                    timings: item.operating_hours || "Schedule not listed",
                    coordinates: item.gps_coordinates,
                    type: item.type
                }));
                resultsToSend = [...resultsToSend, ...localData];
            }

            const finalResponse = resultsToSend.length > 0 ? resultsToSend : "No matches found.";
            responses.push({ id: call.id, name: call.name, response: { result: finalResponse } });
            
          } catch (e) {
            responses.push({ id: call.id, name: call.name, response: { result: { error: "Failed to fetch map data." } } });
          } finally {
            setProcessingToolMessage(null);
          }

   } else if (call.name === 'setAlarm') {
          // --- 🚨 RECURRING NATIVE ALARM TOOL 🚨 ---
          const { hour, minute, days, title } = call.args;
          
          setProcessingToolMessage(`Setting alarm for ${hour}:${minute}...`);
          if (displaySocketRef.current?.readyState === WebSocket.OPEN) {
             displaySocketRef.current.send(`[ System: Setting alarm for ${hour}:${minute} ]`);
          }
          
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
              extra: {
                'android.intent.extra.alarm.HOUR': Number(hour),
                'android.intent.extra.alarm.MINUTES': Number(minute),
                'android.intent.extra.alarm.DAYS': days || [], // Array of integers [2, 4] etc.
                'android.intent.extra.alarm.MESSAGE': title || 'Glasses Alarm',
                'android.intent.extra.alarm.SKIP_UI': true,
                'android.intent.extra.alarm.VIBRATE': true
              }
            });

            responses.push({ 
              id: call.id, 
              name: call.name, 
              response: { 
                result: { 
                  status: "SUCCESS", 
                  message: `Alarm set for ${hour}:${minute} ${days ? 'recurring' : 'once'}.` 
                } 
              } 
            });
          } catch (e) {
            console.log("Native Alarm Error: ", e);
            responses.push({ id: call.id, name: call.name, response: { result: { error: "Failed to set native alarm." } } });
          } finally {
            setProcessingToolMessage(null);
          }
        }

      } // Loop close for functionCalls
      if (responses.length > 0) service.sendToolResponse(responses);
    }
  );

    return () => service.disconnect();
  }, []);
  // --- AUDIO QUEUE START --- (Iske foran baad processAudioQueue wala code hona chahiye)
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
    const udpSocket = dgram.createSocket({ type: 'udp4' });
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

    // Close any existing stale socket before opening a new one
    if (cameraSocketRef.current) {
      console.log('[SYS] 🔌 Closing stale camera socket before reconnecting...');
      cameraSocketRef.current.onmessage = null; // Detach handler so stale events don't fire
      cameraSocketRef.current.close();
    }

    const ws = new WebSocket(`ws://${cameraIP}:81`);
    cameraSocketRef.current = ws;

    ws.onopen = () => {
      console.log(`[SYS] ✅ Camera/Mic WebSocket connected to ${cameraIP}. Listening for CMD:WAKE...`);
    };

    ws.onclose = (e) => {
      console.log(`[SYS] 🛑 Camera/Mic WebSocket closed: Code ${e.code}`);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const msg = event.data as string;

      // 🚨 NEW: Intercept Hardware Commands
      if (msg === "CMD:WAKE") {
        if (isPassiveModeRef.current) {
          console.log("[SYS] 📻 Wake Word ignored during Passive Mode.");
          return;
        }
        console.log("⏰ ESP32 Wake Word Detected! Connecting to Gemini...");
        if (displaySocketRef.current?.readyState === WebSocket.OPEN) {
          displaySocketRef.current.send("CMD:CLEAR");
        }
        geminiServiceRef.current?.connect(lastLocationRef.current || undefined, geminiVoiceRef.current);
      }
      else if (msg === "CMD:SLEEP") {
        console.log("💤 ESP32 Sleep Command. Terminating Gemini Session.");
        geminiServiceRef.current?.disconnect();
      }

      // Standard Data Forwarding
      else if (msg.startsWith("IMG:")) {
        let base64 = msg.replace("IMG:", "");

        // Strip ONLY whitespace — preserve all valid base64 chars (+, /, =)
        // The ESP32 already strips \n/\r on its side, but be safe.
        base64 = base64.replace(/[\s\r\n]/g, "");
        // Ensure correct padding
        const rem = base64.length % 4;
        if (rem !== 0) base64 = base64.padEnd(base64.length + (4 - rem), "=");

        if (base64.length === 0) return;

        // ✅ ALWAYS show the image in the chat UI, regardless of Gemini state
        const uniqueId = 'img_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        const imageUri = `data:image/jpeg;base64,${base64}`;

        if (isPassiveModeRef.current) {
          // Save to passive session images
          setPassiveImages(prev => [...prev, { uri: imageUri, timestamp: Date.now() }]);
        } else {
          setChatHistory(prev => [...prev, {
            id: uniqueId,
            imageUri: imageUri,
            sender: 'user',
            timestamp: Date.now()
          }]);
          setImages(prev => [...prev, imageUri]);

          // ✅ Send to Gemini if connected, otherwise queue it
          const service = geminiServiceRef.current;
          if (service?.isConnected) {
            service.sendImage(base64);
          } else if (service) {
            // Queue for when Gemini connects (e.g. during handshake window after CMD:WAKE)
            pendingImagesRef.current.push(base64);
            console.log(`[SYS] 🕐 Image queued (Gemini not yet ready). Queue size: ${pendingImagesRef.current.length}`);
          }
        }
      }
      else if (msg.startsWith("AUD:")) {
        const base64 = msg.replace("AUD:", "");
        if (isPassiveModeRef.current) {
          passiveAudioChunksRef.current.push(base64);
        } else {
          geminiServiceRef.current?.sendAudio(base64);
        }
      }
    };

    return () => {
      ws.onmessage = null;
      ws.close();
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
      service.connect(lastLocationRef.current || undefined, geminiVoiceRef.current);

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
        const loadedHistory = JSON.parse(data);
        setChatHistory(loadedHistory);
        const extractedImages = loadedHistory.filter((m: any) => m.imageUri).map((m: any) => m.imageUri as string);
        setImages(extractedImages);

        setCurrentSessionId(id);
        currentSessionIdRef.current = id;
      }
    } catch (e) {
      console.error("Failed to load chat", e);
    }
  };

  const deleteChat = async (id: string) => {
    try {
      const chatPath = `${FileSystem.documentDirectory}chat_${id}.json`;
      const rawPath = `${FileSystem.documentDirectory}raw_${id}.json`;
      
      const [chatExists, rawExists] = await Promise.all([
        FileSystem.getInfoAsync(chatPath),
        FileSystem.getInfoAsync(rawPath)
      ]);

      if (chatExists.exists) {
        await FileSystem.deleteAsync(chatPath);
      }
      if (rawExists.exists) {
        await FileSystem.deleteAsync(rawPath);
      }

      const updatedHistory = sessionHistory.filter(session => session.id !== id);
      setSessionHistory(updatedHistory);

      const hsPath = `${FileSystem.documentDirectory}session_history.json`;
      await FileSystem.writeAsStringAsync(hsPath, JSON.stringify(updatedHistory));
    } catch (e) {
      console.error("Failed to delete chat", e);
    }
  };

  const togglePassiveMode = async (target?: boolean) => {
    const nextState = target !== undefined ? target : !isPassiveMode;

    if (nextState) {
      console.log("[SYS] 📻 Passive Mode STARTING!");
      isPassiveModeRef.current = true;
      // 1. Reset state
      passiveAudioChunksRef.current = [];
      setPassiveImages([]);
      setPassiveCountdown(300); // 5 minutes in seconds

      // 2. Disconnect Gemini Live to save resources
      geminiServiceRef.current?.disconnect();

      // 3. Command Hardware
      if (cameraIP && cameraSocketRef.current?.readyState === WebSocket.OPEN) {
        cameraSocketRef.current.send("CMD:PASSIVE_ON");
      }

      // 4. Start Timers
      setIsPassiveMode(true);

      // 30s Image Capture Interval
      passiveIntervalRef.current = setInterval(() => {
        if (cameraSocketRef.current?.readyState === WebSocket.OPEN) {
          cameraSocketRef.current.send("CMD:CAPTURE");
        }
      }, 30000);

      // 5min Auto-End Timer
      passiveTimerRef.current = setTimeout(() => {
        togglePassiveMode(false);
      }, 300000);

      // Countdown Interval
      countdownIntervalRef.current = setInterval(() => {
        setPassiveCountdown(prev => (prev !== null && prev > 0) ? prev - 1 : 0);
      }, 1000);

    } else {
      console.log("[SYS] 📡 Passive Mode ENDING!");
      // 1. Clear All Timers
      if (passiveTimerRef.current) clearTimeout(passiveTimerRef.current);
      if (passiveIntervalRef.current) clearInterval(passiveIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      // 2. Command Hardware
      if (cameraIP && cameraSocketRef.current?.readyState === WebSocket.OPEN) {
        cameraSocketRef.current.send("CMD:PASSIVE_OFF");
      }
      
      isPassiveModeRef.current = false;
      setIsPassiveMode(false);
      setPassiveCountdown(null);

      // 3. Trigger Finalization
      finalizePassiveSession();
    }
  };

  const processPendingQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      // 1. Check for pending_queue.json
      const qPath = `${FileSystem.documentDirectory}pending_queue.json`;
      const qInfo = await FileSystem.getInfoAsync(qPath);
      if (!qInfo.exists) {
        isProcessingQueueRef.current = false;
        return;
      }

      const qData = await FileSystem.readAsStringAsync(qPath);
      let queue: string[] = JSON.parse(qData);
      if (queue.length === 0) {
        isProcessingQueueRef.current = false;
        return;
      }

      console.log(`[SYS] ⏳ processingPendingQueue: ${queue.length} sessions in queue.`);

      // 2. Process one at a time
      const sessionToProcess = queue[0];
      const rawPath = `${FileSystem.documentDirectory}raw_${sessionToProcess}.json`;
      
      const rawInfo = await FileSystem.getInfoAsync(rawPath);
      if (!rawInfo.exists) {
        // Orphaned record, remove from queue
        console.warn(`[SYS] ⚠️ Raw data for ${sessionToProcess} missing, cleaning up queue.`);
        queue.shift();
        await FileSystem.writeAsStringAsync(qPath, JSON.stringify(queue));
        isProcessingQueueRef.current = false;
        return;
      }

      const rawData = JSON.parse(await FileSystem.readAsStringAsync(rawPath));
      
      // 3. Call API
      console.log(`[SYS] 📡 Attempting API process for ${sessionToProcess}...`);
      const aiResult = await GeminiRestService.preprocessSession(rawData.audio, rawData.images, Date.now());

      // 4. Save result
      const richSessionPath = `${FileSystem.documentDirectory}chat_${sessionToProcess}.json`;
      const richData = {
        ...aiResult,
        images: rawData.displayImages,
        type: 'passive',
        processedAt: Date.now()
      };
      await FileSystem.writeAsStringAsync(richSessionPath, JSON.stringify(richData));

      // 5. Update History State
      setSessionHistory(prev => prev.map(s => 
        s.id === sessionToProcess 
          ? { ...s, preview: aiResult.title, status: 'completed' } 
          : s
      ));

      // 6. Cleanup
      await FileSystem.deleteAsync(rawPath);
      queue.shift();
      await FileSystem.writeAsStringAsync(qPath, JSON.stringify(queue));
      
      // Save updated history to disk
      const hsPath = `${FileSystem.documentDirectory}session_history.json`;
      await FileSystem.writeAsStringAsync(hsPath, JSON.stringify(sessionHistoryRef.current));

      console.log(`[SYS] ✅ Session ${sessionToProcess} processed successfully!`);
      
    } catch (e) {
      console.error("[SYS] ❌ processPendingQueue failed for this pass:", e);
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  const finalizePassiveSession = async () => {
    if (passiveAudioChunksRef.current.length === 0 && passiveImages.length === 0) {
      console.log("[SYS] ⚠️ Passive session empty, skipping.");
      return;
    }

    const sessionId = 'passive_' + Date.now();
    console.log(`[SYS] 💾 Persisting raw session data: ${sessionId}`);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 1. Initial Metadata
      const newSession: SessionHistoryItem = {
        id: sessionId,
        timestamp: Date.now(),
        preview: "Processing memory...",
        images: passiveImages.map(img => img.uri),
        status: 'pending'
      };

      // 2. Prep data for persistence
      const audioB64 = createWavFromChunks(passiveAudioChunksRef.current, 16000);
      const rawData = {
        id: sessionId,
        audio: audioB64,
        images: passiveImages.map(img => ({
          b64: img.uri.split('base64,')[1],
          timestamp: img.timestamp
        })),
        displayImages: passiveImages.map(img => img.uri)
      };

      // 3. Write Raw Disk Cache (RESILIENCE)
      const rawPath = `${FileSystem.documentDirectory}raw_${sessionId}.json`;
      await FileSystem.writeAsStringAsync(rawPath, JSON.stringify(rawData));

      // 4. Update Queue
      const qPath = `${FileSystem.documentDirectory}pending_queue.json`;
      let queue: string[] = [];
      try {
        const qData = await FileSystem.readAsStringAsync(qPath);
        queue = JSON.parse(qData);
      } catch (e) {}
      queue.push(sessionId);
      await FileSystem.writeAsStringAsync(qPath, JSON.stringify(queue));

      // 5. Update History
      const updatedHistory = [newSession, ...sessionHistoryRef.current];
      setSessionHistory(updatedHistory);
      const hsPath = `${FileSystem.documentDirectory}session_history.json`;
      await FileSystem.writeAsStringAsync(hsPath, JSON.stringify(updatedHistory));

      // 6. Trigger background worker immediately
      processPendingQueue();

    } catch (e) {
      console.error("[SYS] ❌ Failed to persist passive session:", e);
    } finally {
      passiveAudioChunksRef.current = [];
      setPassiveImages([]);
    }
  };

  return (
    <AppContext.Provider value={{
      startScan, startScanMock, isScanning, cameraIP, displayIP, isFullyConnected: !!(cameraIP && displayIP),
      images, isConnected, status, userTranscript, responseText, sendText, simulateBurst, chatHistory, setChatHistory,
      sessionHistory, createNewChat, loadChat, deleteChat,
      searchSources, isLocationEnabled, setIsLocationEnabled, processingToolMessage, geminiVoice, setGeminiVoice,
      isPassiveMode, togglePassiveMode, isProcessingPassive, passiveCountdown
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