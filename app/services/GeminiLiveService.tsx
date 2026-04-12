/**
 * Gemini Live API Integration Service
 * FULL DUPLEX MODE - No Turns, Continuous Streaming, Native WebSockets
 */

export class GeminiLiveService {
  private apiKey: string;
  private ws: WebSocket | null = null;
  public isConnected: boolean = false;

  private listeners: any = {
    onTextResponse: null,
    onAudioResponse: null,
    onTranscript: null,
    onError: null,
    onConnected: null,
    onDisconnected: null,
    onSearchSources: null,
    onToolCall: null,
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  connect(latLng?: { latitude: number; longitude: number }) {
    if (this.isConnected || this.ws) return;

    const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    console.log(`[SYS] ⏳ Connecting Raw WS to ${model}...`);
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[SYS] ✅ Gemini Socket Open ⚡');
      this.isConnected = true;
      this.sendSetupMessage(model, latLng);
      if (this.listeners.onConnected) this.listeners.onConnected();
    };

    this.ws.onmessage = async (event) => {
      try {
        let textData = '';
        if (typeof event.data === 'string') {
          textData = event.data;
        } else {
          // Because we set binaryType = 'arraybuffer', we bypass all React Native Blob limits.
          const { Buffer } = require('buffer');
          textData = Buffer.from(event.data as ArrayBuffer).toString('utf-8');
        }

        this.handleMessage(textData);
      } catch (e) {
        console.error("[SYS] ❌ Message parsing failed:", e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[SYS] ❌ WebSocket Error:', error);
      if (this.listeners.onError) this.listeners.onError(error);
    };

    this.ws.onclose = (e) => {
      console.log(`[SYS] 🛑 Gemini Disconnected: Code ${e.code}, Reason: ${e.reason}`);
      this.isConnected = false;
      this.ws = null;
      if (this.listeners.onDisconnected) this.listeners.onDisconnected();
    };
  }

  private sendSetupMessage(model: string, latLng?: { latitude: number; longitude: number }) {
    const payload: any = {
      setup: {
        model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        tools: [
          { googleSearch: {} },
          { googleMaps: {} },
          {
            functionDeclarations: [
              {
                name: "fetchCurrentLocation",
                description: "Fetches the user's current GPS location coordinates (latitude and longitude). Call this only when the user explicitly asks for location-based suggestions or directions.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              }
            ]
          }
        ],
      },
    };

    if (latLng) {
      payload.setup.systemInstruction = {
        parts: [{ text: `The user's current location is latitude: ${latLng.latitude}, longitude: ${latLng.longitude}. Use this context for accurate local searches.` }]
      };
      payload.setup.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: latLng.latitude,
            longitude: latLng.longitude
          }
        }
      };
    }

    console.log("[TX] 📤 Sending SETUP Payload");
    this.ws?.send(JSON.stringify(payload));
  }

  handleMessage(data: string) {
    const response = JSON.parse(data);

    if (response.setupComplete) {
      console.log('[RX] 📥 Gemini Setup Complete');
      return;
    }

    if (response.toolCall) {
      console.log('[RX] 🛠️ toolCall received:', JSON.stringify(response.toolCall));
      if (this.listeners.onToolCall) {
        this.listeners.onToolCall(response.toolCall);
      }
    }

    if (response.serverContent) {
      const content = response.serverContent;

      // 1. User Transcript
      const transcript = content.inputTranscription?.text ||
        content.input_transcription?.text;
      if (transcript) {
        console.log(`[RX] 🗣️ User: "${transcript}"`);
        if (this.listeners.onTranscript) this.listeners.onTranscript(transcript);
      }

      // 2. AI Text Response
      if (content.outputTranscription?.text) {
        console.log(`[RX] 🤖 AI: "${content.outputTranscription.text}"`);
        if (this.listeners.onTextResponse) {
          this.listeners.onTextResponse(content.outputTranscription.text, false, false);
        }
      }

      // 3. AI Audio Response
      if (content.modelTurn?.parts) {
        content.modelTurn.parts.forEach((part: any) => {
          if (part.inlineData?.mimeType?.startsWith('audio')) {
            if (this.listeners.onAudioResponse) {
              this.listeners.onAudioResponse(part.inlineData.data, false);
            }
          }
        });
      }

      // 3.5 Grounding Metadata (Google Maps & Search)
      const grounding = content.modelTurn?.groundingMetadata || content.groundingMetadata || response.candidates?.[0]?.groundingMetadata;
      if (grounding?.groundingChunks && this.listeners.onSearchSources) {
        const sources: { title: string; uri: string }[] = [];
        for (const chunk of grounding.groundingChunks) {
          if (chunk.maps) {
            sources.push({ title: chunk.maps.title || 'Google Maps', uri: chunk.maps.uri });
            console.log(chunk)
          } else if (chunk.web) {
            sources.push({ title: chunk.web.title || 'Source', uri: chunk.web.uri });
          }
        }
        if (sources.length > 0) {
          console.log(`[RX] 🌍 Grounding Sources Received: ${sources.length}`);
          this.listeners.onSearchSources(sources);
        }
      }

      // 4. End of Turn (Triggers UI update to move text to history)
      if (content.turnComplete || content.interrupted) {
        console.log(content.interrupted ? '[RX] 🛑 AI Interrupted.' : '[RX] 🏁 AI Turn Complete.');
        if (this.listeners.onTextResponse) this.listeners.onTextResponse("", false, true);
      }
    }
  }

  sendImage(base64Image: string) {
    if (!this.isConnected || !this.ws || !base64Image) return;

    // Strict Base64 padding shield
    let cleanBase64 = base64Image.replace(/[^A-Za-z0-9+/=]/g, "");
    while (cleanBase64.length % 4 !== 0) { cleanBase64 += "="; }

    const payload = {
      realtimeInput: {
        mediaChunks: [{ mimeType: 'image/jpeg', data: cleanBase64 }],
      },
    };

    console.log(`[TX] 📷 Streaming Image Chunk (Size: ${cleanBase64.length})`);
    this.ws.send(JSON.stringify(payload));
  }

  sendAudio(base64Audio: string) {
    if (!this.isConnected || !this.ws || !base64Audio) return;

    let cleanBase64 = base64Audio.replace(/[^A-Za-z0-9+/=]/g, "");

    // 🚨 THE "HALF-SAMPLE" SHIELD 
    // Just in case the ESP32 sends an odd number of bytes, we slice it off 
    // so Gemini's 16-bit audio engine doesn't freak out.
    try {
      let rawBytes = atob(cleanBase64);
      if (rawBytes.length % 2 !== 0) {
        rawBytes = rawBytes.slice(0, -1);
        cleanBase64 = btoa(rawBytes);
      }
    } catch (e) { }

    // Strict Base64 padding
    while (cleanBase64.length % 4 !== 0) { cleanBase64 += "="; }

    const payload = {
      realtimeInput: {
        mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: cleanBase64 }],
      },
    };

    console.log(`[TX] 🎤 Streaming Audio Chunk (Size: ${cleanBase64.length})`);
    this.ws.send(JSON.stringify(payload));
  }

  sendEndTurn() {

  }

  sendToolResponse(functionResponses: any[]) {
    if (!this.isConnected || !this.ws) return;

    const payload = {
      toolResponse: {
        functionResponses,
      }
    };
    console.log(`[TX] 🛠️ Sending toolResponse for ${functionResponses.length} functions.`);
    this.ws.send(JSON.stringify(payload));
  }

  sendText(text: string) {
    if (!this.isConnected || !this.ws) return;

    const payload = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      }
    };
    console.log(`[TX] 📤 Sending Text: "${text}"`);
    this.ws.send(JSON.stringify(payload));
  }

  on(event: string, callback: Function) {
    this.listeners[event] = callback;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}