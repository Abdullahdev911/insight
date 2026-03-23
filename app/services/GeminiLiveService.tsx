/**
 * Gemini Live API Integration Service
 * Fixed for React Native WebSocket handling & CamelCase Schema
 */


export class GeminiLiveService {
  private apiKey: string;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private listeners: any = {
    onTextResponse: null,
    onAudioResponse: null,
    onTranscript: null,
    onError: null,
    onConnected: null,
    onDisconnected: null,
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private listeners: any = {
    onTextResponse: null,
    onAudioResponse: null,
    onTranscript: null,
    onError: null,
    onConnected: null,
    onDisconnected: null,
    onSearchSources: null, // Add this line
  };

  connect() {
    if (this.isConnected || this.ws) return;

    const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    console.log(`Connecting to ${model}...`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('Gemini Socket Open ⚡');
      this.isConnected = true;
      this.sendSetupMessage(model);
      if (this.listeners.onConnected) this.listeners.onConnected();
    };

    this.ws.onmessage = async (event) => {
      try {
        let textData = "";
        if (typeof event.data === 'string') {
          textData = event.data;
        } else if (event.data && typeof event.data === 'object') {
          textData = await new Response(event.data as any).text();
        } else {
          console.error('Unexpected message type:', typeof event.data);
          return;
        }

        this.handleMessage(textData);
      } catch (e) {
        console.error("Message parsing failed:", e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      if (this.listeners.onError) this.listeners.onError(error);
    };

    this.ws.onclose = (e) => {
      console.log('Gemini Disconnected:', e.code, e.reason);
      this.isConnected = false;
      this.ws = null;
      if (this.listeners.onDisconnected) this.listeners.onDisconnected();
    };
  }

  private sendSetupMessage(model: string) {
    const setupMessage = {
      setup: {
        model: model,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Zephyr', 
              },
            },
          },
        },
        output_audio_transcription: {},
        input_audio_transcription: {},
        tools: [{ google_search: {} }],
      },
    };
    this.ws?.send(JSON.stringify(setupMessage));
  }

handleMessage(data: string) {
    const response = JSON.parse(data);

    if (response.setupComplete) {
      console.log('Gemini Setup Complete ✅');
      return;
    }

    if (response.serverContent) {
      const content = response.serverContent;
      console.log(content)

      // 1. Handle User Transcript (Mic Input)
      const transcript = content.inputAudioTranscription?.finalTranscript ||
                         content.input_audio_transcription?.final_transcript;
      if (transcript && this.listeners.onTranscript) {
        this.listeners.onTranscript(transcript);
      }

      // 2. Handle AI's Spoken Text (Ignores internal "Reasoning" thoughts!)
      if (content.outputTranscription?.text && this.listeners.onTextResponse) {
        // Send the text, but turnComplete is false here
        this.listeners.onTextResponse(content.outputTranscription.text, false, false);
      }

      // 3. Handle Raw Audio Payload
      if (content.modelTurn?.parts) {
        content.modelTurn.parts.forEach((part: any) => {
          if (part.inlineData?.mimeType?.startsWith('audio') && this.listeners.onAudioResponse) {
            this.listeners.onAudioResponse(part.inlineData.data, false);
          }
        });
      }

      // NEW: Handle Google Search Grounding Metadata
      const grounding = content.groundingMetadata || content.modelTurn?.groundingMetadata;
      if (grounding?.searchEntryPoint?.renderedContent && this.listeners.onSearchSources) {
        const html = grounding.searchEntryPoint.renderedContent;
        const sources: {title: string, uri: string}[] = [];
        
        // Regex to extract the href URL and the text inside the <a> tags
        const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
          const uri = match[1];
          // Clean up HTML entities (like &#39; to ')
          const title = match[2].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          sources.push({ title, uri });
        }
        
        if (sources.length > 0) {
          this.listeners.onSearchSources(sources);
        }
      }

      // 4. Handle End of Turn (This moves the active text into a chat bubble!)
      if (content.turnComplete && this.listeners.onTextResponse) {
        // Send an empty string, but flag turnComplete as TRUE
        this.listeners.onTextResponse("", false, true);
      }
    }
  }

  // --- ALL SEND FUNCTIONS UPDATED TO STRICT CAMELCASE ---

  sendText(text: string) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      clientContent: { 
        turns: [{ role: 'user', parts: [{ text: text }] }], 
        turnComplete: true 
      }
    }));
  }

  sendImage(base64Image: string) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      realtimeInput: { 
        mediaChunks: [{ mimeType: 'image/jpeg', data: base64Image }] 
      }
    }));
  }

  sendAudio(base64Audio: string) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      realtimeInput: { 
        mediaChunks: [{ mimeType: 'audio/pcm', data: base64Audio }] 
      }
    }));
  }

  sendEndTurn() {
    if (!this.isConnected || !this.ws) return;
    // Sending turnComplete tells Gemini you are done streaming audio/data
    this.ws.send(JSON.stringify({
      clientContent: { turnComplete: true }
    }));
  }

  on(event: string, callback: Function) {
    this.listeners[event] = callback;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}