export interface SpeechRecognitionProvider {
    transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
export declare class GeminiVoiceProvider implements SpeechRecognitionProvider {
    private apiKey;
    constructor(apiKey: string);
    transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
export declare class MockVoiceProvider implements SpeechRecognitionProvider {
    transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
export declare function getVoiceProvider(): SpeechRecognitionProvider;
