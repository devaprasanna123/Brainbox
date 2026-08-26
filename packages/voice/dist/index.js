"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockVoiceProvider = exports.GeminiVoiceProvider = void 0;
exports.getVoiceProvider = getVoiceProvider;
const generative_ai_1 = require("@google/generative-ai");
class GeminiVoiceProvider {
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async transcribe(audioBuffer, mimeType) {
        const ai = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
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
        }
        catch (e) {
            console.error("Gemini Transcription Error:", e);
            throw new Error(`Gemini transcription failed: ${e.message}`);
        }
    }
}
exports.GeminiVoiceProvider = GeminiVoiceProvider;
class MockVoiceProvider {
    async transcribe(audioBuffer, mimeType) {
        console.log(`[DEMO MODE] Transcribing audio buffer of size ${audioBuffer.length} bytes, mimeType ${mimeType}`);
        // Simulate a successful voice recognition transcript
        return "Tomorrow at 10 AM remind me to submit the hackathon project and send an email to Arun Kumar saying the deadline is tomorrow.";
    }
}
exports.MockVoiceProvider = MockVoiceProvider;
function getVoiceProvider() {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && process.env.DEMO_MODE !== "true") {
        return new GeminiVoiceProvider(geminiKey);
    }
    return new MockVoiceProvider();
}
//# sourceMappingURL=index.js.map