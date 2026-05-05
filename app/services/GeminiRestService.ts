/**
 * Gemini REST API Service
 * Handles batch processing for Passive Mode sessions (Multimodal),
 * Memory querying, and Image Generation via Nano Banana 2.
 */

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY || "";
const MODEL = "gemini-2.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

export interface PassiveSessionResult {
  title: string;
  summary: string;
  transcript: { time: string; text: string; speaker?: string }[];
  imageLabels: { imageNumber?: number; time?: string; label: string }[];
}

export class GeminiRestService {
  
  /**
   * Generates an image using Nano Banana 2 (Gemini 3.1 Flash Image)
   * @param prompt The user's image generation request
   * @returns A base64 URI string of the generated image, or null if failed
   */
  /**
   * Generates an image using Nano Banana 2 (Gemini 3.1 Flash Image Preview)
   */
 /**
   * Generates an image using a Free Fallback API (Bypasses Google's 429 Quota Error)
   */
 static async generateImageFromGemini(prompt: string): Promise<string | null> {
    try {
      console.log("🎨 Requesting a fresh AI image via free fallback...");
      
      let cleanPrompt = prompt.toLowerCase()
        .replace(/(create|generate|make|draw|show|search|me|find|provide|give|an|a|image|picture|pic|photo|of)/gi, '')
        .trim();
        
      if (!cleanPrompt) return null; 

      const encodedPrompt = encodeURIComponent(cleanPrompt);
      
      // Use BOTH a random AI seed AND a Unix Timestamp cache-buster!
      const randomSeed = Math.floor(Math.random() * 100000);
      const timestamp = Date.now(); 
      
      // The &t= parameter physically forces React Native to bypass the local phone cache
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=600&nologo=true&seed=${randomSeed}&t=${timestamp}`;
      
      console.log("✅ Unique AI Image URL: " + imageUrl);
      return imageUrl;
      
    } catch (error) {
      console.error("[REST] ❌ Image Generation Failed:", error);
      return null;
    }
  }
  /**
   * Searches the web for a REAL image using a free keyword API
   */
  static async searchImageOnline(query: string): Promise<string | null> {
    try {
      console.log("🔍 Searching the web for real images...");
      
      // Remove conversational words to extract just the core keywords
      // e.g., "Find me images of orange cat" -> "orange cat"
      let cleanQuery = query.toLowerCase()
        .replace(/(search|find|show|display|me|an|images|image|of|pictures|picture|pic|photo|here)/gi, '')
        .trim();

      // Convert spaces to commas for the search engine (e.g., "orange,cat")
      cleanQuery = cleanQuery.replace(/\s+/g, ',');

      if (!cleanQuery) return null;

      // Fetches a real image from the web matching the keywords!
      const imageUrl = `https://loremflickr.com/600/600/${cleanQuery}`;
      
      console.log("✅ Real image found: " + imageUrl);
      return imageUrl;
    } catch (error) {
      console.error("[REST] ❌ Image Search Failed:", error);
      return null;
    }
  }

  /**
   * Processes a 5-minute passive recording session.
   * @param audioBase64 The full WAV audio in base64 format.
   * @param images Array of images in base64 format.
   * @param startTime Timestamp when the session started.
   */
  static async preprocessSession(
    audioBase64: string,
    images: { b64: string; timestamp: number }[],
    startTime: number
  ): Promise<PassiveSessionResult> {
    console.log(`[REST] 📤 Sending batch request to Gemini (${images.length} images + audio)...`);

    // Helper to completely sanitize and correctly pad base64
    const sanitizeBase64 = (b64: string) => {
      // 1. Strip everything that isn't a valid base64 layout character
      let clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");

      // Remove any existing padding so we can recalculate from raw data
      clean = clean.replace(/=+$/, "");

      // 2. If the string mathematically cannot form complete bytes (rem === 1), 
      //    it was network-truncated in the middle of a token. Drop the dangling char.
      if (clean.length % 4 === 1) {
        clean = clean.substring(0, clean.length - 1);
      }

      // 3. Apply standard RFC 4648 padding (Max 2 equals)
      const rem = clean.length % 4;
      if (rem !== 0) {
        clean = clean.padEnd(clean.length + (4 - rem), "=");
      }
      return clean;
    };

    const imageParts = [];
    let droppedImages = 0;
    let validImageCount = 0;

    for (const img of images) {
      const cleanB64 = sanitizeBase64(img.b64);
      if (cleanB64.length > 100) {
        try {
          atob(cleanB64);

          validImageCount++;
          // Interleaving text explicitly anchors the AI to the correct sequential order
          imageParts.push({ text: `Image ${validImageCount}:` });
          imageParts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanB64
            }
          });
        } catch (e) {
          droppedImages++;
          console.warn("[REST] ⚠️ Dropping corrupted image chunk (Base64 decode failed locally).");
        }
      }
    }

    if (droppedImages > 0) {
      console.log(`[REST] 🛡️ Shielded payload from ${droppedImages} corrupted network image(s). Proceeding with remaining ${validImageCount} images.`);
    }

    const audioPart = {
      inlineData: {
        mimeType: "audio/wav",
        data: audioBase64
      }
    };

    const promptText = `
      You are Insight, an AI assistant for smart glasses. I am providing a 5-minute audio recording and a sequence of explicitly numbered images (Image 1, Image 2, etc.) captured at 30-second intervals during a "Long Term Memory" session.
      
      TASK:
      1. Transcribe the audio verbatim. Group text into logical segments with [MM:SS] timestamps. 
         - If multiple people are speaking, label them (e.g., "User", "Speaker 2").
         - Identify Urdu vs English and transcribe accordingly in the correct script.
      2. For each provided image (Image 1, Image 2, etc.), provide a 1-sentence descriptive label of what the user is seeing. Match the labels EXACTLY to the provided image numbers sequentially. Each image represents a 30-second advancement in time.
      3. Summarize the overall activities and context of this 5-minute window.
      4. Give the session a 3-5 word descriptive title (e.g., "Cooking dinner in kitchen" or "Team sync meeting").

      OUTPUT FORMAT:
      Your output MUST be a valid JSON object with the following structure:
      {
        "title": "...",
        "summary": "...",
        "transcript": [{ "time": "MM:SS", "text": "...", "speaker": "..." }],
        "imageLabels": [{ "imageNumber": 1, "label": "..." }]
      }
    `;

    const body = {
      contents: [
        {
          parts: [
            { text: promptText },
            audioPart,
            ...imageParts
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${err}`);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error("Empty response from Gemini");
      }

      return JSON.parse(textResponse) as PassiveSessionResult;
    } catch (e) {
      console.error("[REST] ❌ Preprocessing failed:", e);
      throw e;
    }
  }

  /**
   * Queries an existing passive session based on its summary, transcript, and labels.
   */
  static async queryMemory(session: PassiveSessionResult, query: string): Promise<string> {
    const promptText = `
      You are Insight. The following is a timeline of a 5-minute "Memory" session captured by the user's smart glasses.
      
      SESSION TITLE: ${session.title}
      SUMMARY: ${session.summary}
      
      TRANSCRIPT:
      ${session.transcript.map(t => `[${t.time}] ${t.speaker || 'Unknown'}: ${t.text}`).join('\n')}
      
      VISUAL TIMELINE:
      ${session.imageLabels.map(l => `[Image ${l.imageNumber || '?'}] ${l.label}`).join('\n')}
      
      USER QUERY: "${query}"
      
      Please answer the user's query specifically using the context provided above. Be concise and conversational. Do not mention that you are reading from a transcript or labels, just answer as if you recall it.
    `;

    const body = {
      contents: [{ parts: [{ text: promptText }] }]
    };

    try {
      const response = await fetch(API_URL, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error(await response.text());

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return textResponse || "I'm sorry, I couldn't understand that.";
    } catch (e) {
      console.error("[REST] Memory query failed:", e);
      throw e;
    }
  }
}