import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { GeminiLiveService } from '../services/GeminiLiveService';
import { createWavHeader } from '../utils/audioUtils';

// ⚠️ Use ENV variable
const API_KEY = "AIzaSyD812PSJvFjX3t1UTILJr23J02eYkRmN6k"; 

export default function useGeminiLive() {
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const audioQueue = useRef<string[]>([]);
  const isPlaying = useRef(false);

  const [state, setState] = useState({
    isConnected: false,
    status: 'Disconnected',
    userTranscript: '',
    responseText: '',
  });

  const processAudioQueue = async () => {
    if (isPlaying.current || audioQueue.current.length === 0) return;
    isPlaying.current = true;

    try {
      const chunk = audioQueue.current.shift();
      if (!chunk) return;

      // ⚡ CALCULATE HEADER DYNAMICALLY
      // Gemini 2.5 Flash Native Audio is usually 24kHz
      const byteLength = (chunk.length * 3) / 4;
      const header = createWavHeader(byteLength, 24000); 
      
      const wavData = header + chunk;
      const path = `${FileSystem.cacheDirectory}gemini_live_${Date.now()}.wav`;

      await FileSystem.writeAsStringAsync(path, wavData, { encoding: FileSystem.EncodingType.Base64 });
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
      processAudioQueue();
    }
  };

  useEffect(() => {
    const service = new GeminiLiveService(API_KEY);
    serviceRef.current = service;

    service.on('onConnected', () => setState(s => ({ ...s, isConnected: true, status: 'Listening' })));
    service.on('onDisconnected', () => setState(s => ({ ...s, isConnected: false, status: 'Disconnected' })));
    service.on('onTranscript', (text: string) => setState(s => ({ ...s, userTranscript: text })));
    service.on('onTextResponse', (text: string, isDone: boolean) => {
        setState(s => ({ ...s, responseText: s.responseText + text, status: 'Speaking...' }));
        if (isDone) setState(s => ({ ...s, status: 'Done' }));
    });
    service.on('onAudioResponse', (base64Audio: string) => {
        audioQueue.current.push(base64Audio);
        if (!isPlaying.current) processAudioQueue();
    });

    service.connect();
    return () => service.disconnect();
  }, []);

  const sendImage = (base64: string) => serviceRef.current?.sendImage(base64);
  const sendAudio = (base64: string) => serviceRef.current?.sendAudio(base64);
  const sendEndTurn = () => serviceRef.current?.sendEndTurn();

  // Test Tool
  const simulateBurst = () => {
      setState(s => ({ ...s, status: "Thinking...", userTranscript: "What is this?", responseText: "" }));
      sendImage("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=");
      setTimeout(() => {
          sendAudio("UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAA==");
          sendEndTurn();
      }, 500);
  };

  return { ...state, sendImage, sendAudio, sendEndTurn, simulateBurst };
}