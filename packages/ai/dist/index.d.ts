import { WorkflowPlan } from "@brain-box-ai/shared";
export interface MemoryRecord {
    id: string;
    workspaceId: string;
    type: string;
    key: string;
    value: string;
    importance?: number;
    createdAt: string;
    updatedAt: string;
}
export interface MemoryCandidate {
    shouldRemember: boolean;
    memoryType: string;
    key: string;
    content: string;
    importance: number;
}
export interface ChatContext {
    recentMessages: {
        role: string;
        content: string;
    }[];
    summary?: string;
    memories?: string[];
    timezone?: string;
    userProfile?: string;
}
export interface ToolCall {
    tool: string;
    arguments: Record<string, any>;
}
export interface LLMResponse {
    content: string;
    toolCalls?: ToolCall[];
    confidence?: number;
    needsClarification?: boolean;
    question?: string;
    wakePhraseDetected?: boolean;
}
export type IntentType = "CHAT" | "SEND_EMAIL" | "READ_EMAIL" | "SEARCH_EMAIL" | "CREATE_DRAFT" | "CREATE_CALENDAR_EVENT" | "LIST_CALENDAR_EVENTS" | "CREATE_GOOGLE_DOC" | "READ_GOOGLE_DOC" | "SEARCH_DRIVE" | "CREATE_DRIVE_FILE" | "READ_SHEET" | "WRITE_SHEET" | "SEARCH_SHEET" | "MEMORY_QUERY" | "WORKFLOW_CREATE" | "WORKFLOW_RUN" | "OTHER";
export interface ClassifiedIntent {
    intent: IntentType;
    confidence: number;
    parameters: Record<string, any>;
    reasoning?: string;
}
export interface AIProvider {
    generateResponse(prompt: string, context?: ChatContext): Promise<string>;
    generateStructuredResponse<T>(prompt: string, schema: any, context?: ChatContext): Promise<T>;
    generateWithTools(prompt: string, tools: any[], context?: ChatContext): Promise<LLMResponse>;
    extractMemory(message: string, conversationContext?: string): Promise<MemoryCandidate | null>;
}
export interface LLMProvider extends AIProvider {
    chat(context: ChatContext): Promise<LLMResponse>;
    streamChat(context: ChatContext, onChunk: (chunk: string) => void): Promise<LLMResponse>;
    generateWorkflow(input: string): Promise<WorkflowPlan>;
    planTools(input: string): Promise<ToolCall[]>;
}
export declare function isWakePhrase(text: string): boolean;
export declare function isFastPathGreeting(text: string): {
    isFastPath: boolean;
    response?: string;
};
export declare function extractContentDelta(fullTextSoFar: string, lastExtractedLength: number): {
    newContent: string;
    newLength: number;
};
export declare function validateToolCalls(rawCalls: any[]): ToolCall[];
export declare function parseJSONOrRepair(text: string): {
    content: string;
    toolCalls: ToolCall[];
    confidence?: number;
    needsClarification?: boolean;
    question?: string;
};
export declare function retrieveRelevantMemories(query: string, memories: MemoryRecord[], maxMemories?: number): MemoryRecord[];
export declare function getTimezoneOffsetString(timeZone?: string, date?: Date): string;
export declare function calculateTargetDateTime(text: string, timeZone?: string): string;
export declare function heuristicClassifyIntent(message: string, timezone?: string): ClassifiedIntent;
export declare function classifyIntent(message: string, provider?: AIProvider, context?: ChatContext): Promise<ClassifiedIntent>;
export declare function buildIntentLLMResponse(intentResult: ClassifiedIntent): LLMResponse | null;
export declare class GeminiProvider implements LLMProvider {
    private ai;
    private modelName;
    private fallbackModelName;
    constructor(apiKey: string);
    generateResponse(prompt: string, context?: ChatContext): Promise<string>;
    generateStructuredResponse<T>(prompt: string, schema: any, context?: ChatContext): Promise<T>;
    generateWithTools(prompt: string, tools: any[], context?: ChatContext): Promise<LLMResponse>;
    streamChat(context: ChatContext, onChunk: (chunk: string) => void): Promise<LLMResponse>;
    chat(context: ChatContext): Promise<LLMResponse>;
    extractMemory(message: string, conversationContext?: string): Promise<MemoryCandidate | null>;
    generateWorkflow(input: string): Promise<WorkflowPlan>;
    planTools(input: string): Promise<ToolCall[]>;
}
export declare const GeminiLLMProvider: typeof GeminiProvider;
export declare function isProviderFailure(err: any): boolean;
export declare class OpenRouterLLMProvider implements LLMProvider {
    private apiKey;
    private modelName;
    constructor(apiKey: string, modelName?: string);
    private getSystemPrompt;
    private fetchOpenRouter;
    generateResponse(prompt: string, context?: ChatContext): Promise<string>;
    generateStructuredResponse<T>(prompt: string, schema: any, context?: ChatContext): Promise<T>;
    generateWithTools(prompt: string, tools: any[], context?: ChatContext): Promise<LLMResponse>;
    streamChat(context: ChatContext, onChunk: (chunk: string) => void): Promise<LLMResponse>;
    chat(context: ChatContext): Promise<LLMResponse>;
    extractMemory(message: string, conversationContext?: string): Promise<MemoryCandidate | null>;
    generateWorkflow(input: string): Promise<WorkflowPlan>;
    planTools(input: string): Promise<ToolCall[]>;
}
export declare class FallbackLLMProvider implements LLMProvider {
    private primary;
    private fallback;
    private openrouterModel;
    private primaryName;
    constructor(primary: LLMProvider, fallback: LLMProvider | null, openrouterModel?: string, primaryName?: string);
    private executeWithFailover;
    chat(context: ChatContext): Promise<LLMResponse>;
    streamChat(context: ChatContext, onChunk: (chunk: string) => void): Promise<LLMResponse>;
    generateResponse(prompt: string, context?: ChatContext): Promise<string>;
    generateStructuredResponse<T>(prompt: string, schema: any, context?: ChatContext): Promise<T>;
    generateWithTools(prompt: string, tools: any[], context?: ChatContext): Promise<LLMResponse>;
    extractMemory(message: string, conversationContext?: string): Promise<MemoryCandidate | null>;
    generateWorkflow(input: string): Promise<WorkflowPlan>;
    planTools(input: string): Promise<ToolCall[]>;
}
export declare function getLLMProvider(): LLMProvider;
