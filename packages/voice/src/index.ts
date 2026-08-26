import { GoogleGenerativeAI } from "@google/generative-ai";

export interface SpeechRecognitionProvider {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}

export class GeminiVoiceProvider implements SpeechRecognitionProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const ai = new GoogleGenerativeAI(this.apiKey);
    const modelName = process.env.AI_MODEL || "gemini-3.6-flash";
    const model = ai.getGenerativeModel({ model: modelName });

    try {
      const response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: audioBuffer.toString("base64"),
                  mimeType: mimeType,
                },
              },
              { text: "Transcribe this audio file exactly. Return only the spoken words, nothing else." },
            ],
          },
        ],
      });

      return response.response.text().trim();
    } catch (e: any) {
      console.error("Gemini Transcription Error:", e);
      throw new Error(`Gemini transcription failed: ${e.message}`);
    }
  }
}

export class MockVoiceProvider implements SpeechRecognitionProvider {
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    console.log(`[DEMO MODE] Transcribing audio buffer of size ${audioBuffer.length} bytes, mimeType ${mimeType}`);
    // Simulate a successful voice recognition transcript
    return "Tomorrow at 10 AM remind me to submit the hackathon project and send an email to Arun Kumar saying the deadline is tomorrow.";
  }
}

export function getVoiceProvider(): SpeechRecognitionProvider {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && process.env.DEMO_MODE !== "true") {
    return new GeminiVoiceProvider(geminiKey);
  }
  return new MockVoiceProvider();
}
