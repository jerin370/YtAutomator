import { GoogleGenAI, Type, Modality } from '@google/genai';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Decodes a base64 string into a Uint8Array.
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Encodes a Uint8Array into a base64 string.
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Adds a WAV header to raw PCM audio data.
 * @param pcmData The raw PCM audio data.
 * @param sampleRate The sample rate of the audio.
 * @param numChannels The number of audio channels.
 * @param bitsPerSample The number of bits per sample.
 * @returns A Uint8Array containing the complete WAV file data.
 */
const addWavHeader = (pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array => {
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    const blockAlign = numChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size for PCM
    view.setUint16(20, 1, true); // AudioFormat 1 for PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmData, 44);

    return wavBytes;
};


export const generateScript = async (topic: string): Promise<string> => {
  try {
    const prompt = `Generate a captivating and engaging YouTube video script about "${topic}". The script should be around 300-400 words. Structure it with clear sections: an exciting 'Intro', two or three 'Main Content' parts, and a concluding 'Outro' with a call to action. The actual narration content for each section MUST be enclosed in double quotes (""). Do not include quotes for the section titles.
    
    For example:
    Intro:
    "Welcome to our channel! Today we explore..."

    Main Content:
    "First, let's look at..."

    Ensure the tone is conversational and suitable for a general audience.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error('Error generating script:', error);
    throw new Error('Failed to generate script. Please check your API key and try again.');
  }
};

export const generateYouTubeDetails = async (script: string): Promise<{ title: string; description: string; tags: string[]; imagePrompts: string[] }> => {
    try {
        const prompt = `Based on the following video script, generate a suitable YouTube video title, a compelling description (under 150 words), a list of 10 relevant SEO tags, and a list of 5 descriptive prompts for generating background visuals (short video clips or animations).

        Script:
        ---
        ${script}
        ---
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A catchy and SEO-friendly YouTube video title." },
                        description: { type: Type.STRING, description: "A compelling video description." },
                        tags: { 
                            type: Type.ARRAY, 
                            items: { type: Type.STRING },
                            description: "An array of relevant SEO tags."
                        },
                        imagePrompts: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "An array of 5 descriptive prompts for animated visuals."
                        }
                    },
                    required: ["title", "description", "tags", "imagePrompts"],
                },
            },
        });
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error('Error generating YouTube details:', error);
        throw new Error('Failed to generate video details.');
    }
};

export const generateStaticVisual = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
          responseModalities: [Modality.IMAGE],
      },
    });
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        // The Gemini Flash Image model returns PNGs.
        return `data:image/png;base64,${base64ImageBytes}`;
      }
    }
    throw new Error("No image data found in AI response.");
  } catch (error) {
    console.error('Error generating static visual:', error);
    throw new Error(`Failed to generate static visual for prompt: "${prompt}".`);
  }
};


export const generateVoiceover = async (script: string, voice: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: script }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data received from API.");
        }
        
        // The API returns raw PCM data, so we need to add a WAV header to make it a playable file.
        const pcmData = decode(base64Audio);
        
        // Gemini TTS uses 24000Hz sample rate, 1 channel (mono), 16 bits per sample.
        const wavData = addWavHeader(pcmData, 24000, 1, 16);
        
        const wavBase64 = encode(wavData);
        
        return `data:audio/wav;base64,${wavBase64}`;

    } catch (error) {
        console.error('Error generating voiceover:', error);
        throw new Error('Failed to generate voiceover audio.');
    }
}