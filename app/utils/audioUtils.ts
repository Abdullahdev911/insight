// utils/audioUtils.ts

/**
 * Converts a Base64 string to a Uint8Array
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Converts a Uint8Array to a Base64 string
 */
const uint8ToBase64 = (u8Arr: Uint8Array): string => {
  let binary = '';
  const len = u8Arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(u8Arr[i]);
  }
  return btoa(binary);
};

/**
 * Creates a valid WAV header for PCM audio
 * Ported from official Google GenAI SDK example
 */
export const createWavHeader = (dataLength: number, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): string => {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');
  
  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);    // NumChannels
  view.setUint32(24, sampleRate, true);     // SampleRate
  view.setUint32(28, byteRate, true);       // ByteRate
  view.setUint16(32, blockAlign, true);     // BlockAlign
  view.setUint16(34, bitsPerSample, true);  // BitsPerSample
  
  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);     // Subchunk2Size
  
  // Convert header to Base64 to prep for concatenation
  return uint8ToBase64(new Uint8Array(buffer));
};