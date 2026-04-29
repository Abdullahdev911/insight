/**
 * Gemini Live API Integration Service
 * FULL DUPLEX MODE - No Turns, Continuous Streaming, Native WebSockets
 */

export class GeminiLiveService {
  private apiKey: string;
  private ws: WebSocket | null = null;
  public isConnected: boolean = false;

  // Reconnection state
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLatLng?: { latitude: number; longitude: number };
  private intentionalDisconnect: boolean = false;
  private lastVoiceName: string = 'Zephyr'; 

  private listeners: any = {
    onTextResponse: null,
    onAudioResponse: null,
    onTranscript: null,
    onError: null,
    onConnected: null,
    onDisconnected: null,
    onSearchSources: null,
    onToolCall: null,
    onReconnecting: null,
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  connect(latLng?: { latitude: number; longitude: number }, voiceName: string = 'Zephyr') {
    if (this.isConnected || this.ws) return;

    this.intentionalDisconnect = false;
    this.lastLatLng = latLng;
    this.lastVoiceName = voiceName; 
    const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    console.log(`[SYS] ⏳ Connecting Raw WS to ${model}... (Attempt ${this.reconnectAttempts + 1})`);
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[SYS] ✅ Gemini Socket Open ⚡');
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset on successful connection
      this.sendSetupMessage(model, latLng, voiceName);
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
      console.log(`[SYS] 🛑 Gemini Disconnected: Code ${e.code}, Reason: ${e.reason || 'No reason'}`);
      this.isConnected = false;
      this.ws = null;

      // Normal closure (1000) or intentional = don't reconnect
      if (this.intentionalDisconnect || e.code === 1000) {
        this.reconnectAttempts = 0;
        if (this.listeners.onDisconnected) this.listeners.onDisconnected();
        return;
      }

      // Code 1007 = Invalid data (bad Base64). Code 1006 = Abnormal closure. Attempt reconnect.
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 15000); // Exp backoff: 1s, 2s, 4s, 8s, 15s
        console.log(`[SYS] 🔄 Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        if (this.listeners.onReconnecting) {
          this.listeners.onReconnecting(this.reconnectAttempts, this.maxReconnectAttempts, delay);
        }

        this.reconnectTimer = setTimeout(() => {
          this.connect(this.lastLatLng, this.lastVoiceName);
        }, delay);
      } else {
        console.error(`[SYS] ❌ Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
        this.reconnectAttempts = 0;
        if (this.listeners.onDisconnected) this.listeners.onDisconnected();
      }
    };
  }

 private sendSetupMessage(model: string, latLng?: { latitude: number; longitude: number }, voiceName: string = 'Zephyr') {
    // 1. Define the Persona, THE IRONCLAD SCRIPT BAN & TIMEZONE RULE
    const baseSystemPrompt = `You are Insight, an advanced AI assistant powering a pair of smart glasses. 
Your responses are delivered via an audio speaker and a small OLED display, so keep your answers concise, natural, and highly conversational. 

CRITICAL TRANSCRIPTION & LANGUAGE LOCK: The user will strictly and exclusively speak in either English or Urdu. The acoustic input you receive will never be any other language. 

1. INPUT TRANSCRIPTION RULE: When generating the user's input transcript, you MUST format the text EXCLUSIVELY using the English alphabet (Latin script) or the Urdu alphabet (Arabic/Nastaliq script). 
* If the user speaks Urdu/Hindustani, you MUST transcribe it using the Urdu script. 
* NEVER transcribe it in Hindi (Devanagari script). 
* NEVER transcribe in Malayalam, Arabic, or any other language's alphabet. 

2. OUTPUT RULE: You must only speak and respond in English or Urdu. If you hear background noise, ignore it entirely. Do not attempt to translate or transcribe background noise.

3. TIME & ALARMS RULE: You are in Karachi, Pakistan. Current user time is Karachi time. Always use 24-hour format for the hour parameter when setting alarms.`; // 👈 Yeh nayi line yahan add ho gayi hai

    // 2. Dynamically Append Location Context
    let finalSystemPrompt = baseSystemPrompt;
    
    if (latLng) {
      finalSystemPrompt += `\n\nLOCATION CONTEXT: The user's EXACT current GPS location is latitude ${latLng.latitude}, longitude ${latLng.longitude} (Karachi, Pakistan). When performing any location-based search (e.g., restaurants, places, directions), you MUST use these coordinates to find results near this location. Do NOT use US or any other region's data. Always return local Pakistani results.`;
    } else {
      finalSystemPrompt += `\n\nLOCATION CONTEXT: The user is located in Karachi, Pakistan. When performing any location-based search, you MUST first call the fetchCurrentLocation function. CRITICAL INSTRUCTION: Once you receive the coordinates, explicitly append the city, country, or coordinates to your Google Search query (e.g., "[Query] near [Latitude], [Longitude] Karachi Pakistan") to ensure local results.`;
    }

    const payload: any = {
      setup: {
        model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
            languageCode: 'en-US',
          },
        },
        systemInstruction: {
          parts: [{ text: finalSystemPrompt }]
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        tools: [
          { googleSearch: {} },
          // { googleMaps: {} }, // Kept commented out to prevent websocket crashes
          {
            functionDeclarations: [
              {
                name: "fetchCurrentLocation",
                description: "Fetches the user's current GPS location coordinates (latitude and longitude). Call this only when the user explicitly asks for location-based suggestions or directions.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              {
                name: "captureCameraFrame",
                description: "Instructs the hardware to snap a picture. Call this immediately when asked to look at something, read text, or identify a prior/new object mid-conversation.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              {
                name: "endConversation",
                description: "Instructs the system to gracefully terminate the interaction. Call this when the user says goodbye or dismisses the AI.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              // NEW SMS TOOL FOR HANDS-FREE SENDING
              {
                name: "sendSilentSMS",
                description: "Sends an SMS message directly in the background. CRITICAL RULE: You MUST first verbally tell the user what the message says and explicitly ask for their confirmation (e.g., 'The message to Hasan says: Project is ready. Should I send it?'). ONLY call this function AFTER the user says 'yes', 'send it', or agrees.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    contactName: { type: "STRING", description: "The exact name of the person to text (e.g., Hasan)" },
                    message: { type: "STRING", description: "The actual message content" }
                  },
                  required: ["contactName", "message"]
                }
              },
              {
                name: "getCurrentLocation",
                description: "Gets the user's exact current GPS coordinates (latitude, longitude) from their device. Always call this first if the user asks where they are or searches for nearby places."
              }, // 👈 Yahan ek extra comma (,) tha jis se code crash ho sakta tha, maine hata diya hai.
              {
                name: "searchGoogleMaps",
                description: "CRITICAL & MANDATORY TOOL: ALWAYS use this tool to find places, restaurants, buildings (e.g., KTrade), or locations. It returns addresses, timings, phone numbers, and coordinates. Use the returned coordinates to calculate the distance from the user if asked.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    query: { type: "STRING", description: "What to search for (e.g. 'KFC at shahrafaisal')." },
                    latitude: { type: "NUMBER", description: "Latitude." },
                    longitude: { type: "NUMBER", description: "Longitude." }
                  },
                  required: ["query"]
                }
              },
              {
                name: "setAlarm",
                description: "Sets a recurring or one-time alarm at a specific time. Call this when the user asks to set an alarm or reminder for a specific time or day.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    hour: { type: "NUMBER", description: "Hour in 24-hour format (0-23)." },
                    minute: { type: "NUMBER", description: "Minutes (0-59)." },
                    days: { 
                      type: "ARRAY", 
                      items: { type: "NUMBER" }, 
                      description: "Days of week: 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday. Leave empty for a one-time alarm." 
                    },
                    title: { type: "STRING", description: "Title of the alarm (e.g., 'Wake up', 'Medicine time')." }
                  },
                  required: ["hour", "minute"]
                }
              }
            ]
          }
        ],

      },
    };

    if (latLng) {
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

      // 4. End of Turn
      if (content.turnComplete || content.interrupted) {
        console.log(content.interrupted ? '[RX] 🛑 AI Interrupted.' : '[RX] 🏁 AI Turn Complete.');
        if (this.listeners.onTextResponse) this.listeners.onTextResponse("", false, true);
      }
    }
  }

  sendImage(base64Image: string) {
    if (!this.isConnected || !this.ws || !base64Image) return;

    try {
      const cleanBase64 = base64Image.replace(/[\s\r\n]/g, "");

      if (cleanBase64.length === 0) {
        console.warn('[TX] ⚠️ Skipping empty image chunk');
        return;
      }

      if (cleanBase64.length % 4 !== 0) {
        console.warn(`[TX] ⚠️ Image base64 length not divisible by 4 (${cleanBase64.length}), padding...`);
      }
      const paddedBase64 = cleanBase64.padEnd(cleanBase64.length + (4 - cleanBase64.length % 4) % 4, '=');

      const payload = {
        realtimeInput: {
          mediaChunks: [{ mimeType: 'image/jpeg', data: paddedBase64 }],
        },
      };

      console.log(`[TX] 📷 Streaming Image Chunk (Size: ${paddedBase64.length})`);
      this.ws.send(JSON.stringify(payload));
    } catch (e) {
      console.error('[TX] ❌ Failed to send image chunk:', e);
    }
  }

  sendAudio(base64Audio: string) {
    if (!this.isConnected || !this.ws || !base64Audio) return;

    try {
      let cleanBase64 = base64Audio.replace(/[\s\r\n]/g, "");

      if (cleanBase64.length === 0) return;

      try {
        let rawBytes = atob(cleanBase64);
        if (rawBytes.length % 2 !== 0) {
          rawBytes = rawBytes.slice(0, -1);
          cleanBase64 = btoa(rawBytes);
        }
      } catch (e) {
        console.warn('[TX] ⚠️ Audio atob failed, skipping chunk:', e);
        return;
      }

      cleanBase64 = cleanBase64.padEnd(cleanBase64.length + (4 - cleanBase64.length % 4) % 4, '=');

      const payload = {
        realtimeInput: {
          mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: cleanBase64 }],
        },
      };

      this.ws.send(JSON.stringify(payload));
    } catch (e) {
      console.error('[TX] ❌ Failed to send audio chunk:', e);
    }
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
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.ws?.close(1000, 'User disconnected');
    this.ws = null;
    this.isConnected = false;
  }
}