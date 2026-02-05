/**
 * Gemini Live API Integration Service
 * Adapted from official Google GenAI SDK example
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

  connect() {
    if (this.isConnected || this.ws) return;

    // ⚡ USE THE MODEL FROM THE OFFICIAL SNIPPET
    const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
    
    // Use v1alpha for experimental/preview models
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
        // Blob -> Text handling for React Native
        if (typeof event.data === 'string') {
            textData = event.data;
        } else if (event.data instanceof Blob || event.data.constructor.name === 'Blob') {
             textData = await new Response(event.data).text();
        } else {
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
          // Request both so we can display text on glasses AND play audio
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Zephyr', // Using 'Zephyr' from your example
              },
            },
          },
        },
        // input_audio_transcription: { },
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
      const turnComplete = content.turnComplete || false;

      // 1. Handle Transcript
      const transcript = content.inputAudioTranscription?.finalTranscript || 
                         content.input_audio_transcription?.final_transcript;
      if (transcript && this.listeners.onTranscript) {
          this.listeners.onTranscript(transcript);
      }

      // 2. Handle Model Response
      if (content.modelTurn?.parts) {
        content.modelTurn.parts.forEach((part: any) => {
          // Text
          if (part.text && this.listeners.onTextResponse) {
            this.listeners.onTextResponse(part.text, turnComplete);
          }
          // Audio (Matches snippet's part.inlineData handling)
          if (part.inlineData?.mimeType?.startsWith('audio') && this.listeners.onAudioResponse) {
            this.listeners.onAudioResponse(part.inlineData.data, turnComplete);
          }
        });
      }
    }
  }

  // ... (sendText, sendImage, sendAudio, sendEndTurn, on, disconnect methods remain the same)
  sendText(text: string) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      client_content: { turns: [{ role: 'user', parts: [{ text }] }], turn_complete: true },
    }));
  }

  sendImage(base64Image: string) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      realtime_input: { media_chunks: [{ mime_type: 'image/jpeg', data: base64Image }] },
    }));
  }

  sendAudio(base64Audio: string) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      realtime_input: { media_chunks: [{ mime_type: 'audio/pcm', data: base64Audio }] },
    }));
  }
  
  sendEndTurn() {
     if (!this.isConnected || !this.ws) return;
     this.ws.send(JSON.stringify({ client_content: { turn_complete: true } }));
  }

  on(event: string, callback: Function) {
    this.listeners[event] = callback;
  }
  
  disconnect() {
      this.ws?.close();
      this.ws = null;
  }
}