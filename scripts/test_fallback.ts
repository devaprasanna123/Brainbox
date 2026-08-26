import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  FallbackLLMProvider,
  isProviderFailure,
  LLMProvider,
  LLMResponse,
  ChatContext,
  MemoryCandidate,
} from "../packages/ai/src/index";

class MockPrimaryProvider implements LLMProvider {
  public failStatus: number = 0;
  public failMessage: string = "";
  public callCount: number = 0;

  async generateResponse(prompt: string, context?: ChatContext): Promise<string> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return "Primary Gemini Response";
  }

  async generateStructuredResponse<T>(prompt: string, schema: any, context?: ChatContext): Promise<T> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { success: true } as unknown as T;
  }

  async generateWithTools(prompt: string, tools: any[], context?: ChatContext): Promise<LLMResponse> {
    return this.chat({ recentMessages: [{ role: "user", content: prompt }] });
  }

  async streamChat(context: ChatContext, onChunk: (chunk: string) => void): Promise<LLMResponse> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary streaming failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    onChunk("Primary Gemini Stream Response");
    return { content: "Primary Gemini Stream Response", confidence: 1.0 };
  }

  async chat(context: ChatContext): Promise<LLMResponse> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { content: "Primary Gemini Response", confidence: 1.0 };
  }

  async extractMemory(message: string, conversationContext?: string): Promise<MemoryCandidate | null> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { shouldRemember: true, memoryType: "fact", key: "test", content: message, importance: 0.8 };
  }

  async generateWorkflow(input: string): Promise<any> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { title: "Primary Workflow", description: "Primary", nodes: [], edges: [] };
  }

  async planTools(input: string): Promise<any[]> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Primary failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return [];
  }
}

class MockFallbackProvider implements LLMProvider {
  public failStatus: number = 0;
  public failMessage: string = "";
  public callCount: number = 0;

  async generateResponse(prompt: string, context?: ChatContext): Promise<string> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return "OpenRouter Fallback Response";
  }

  async generateStructuredResponse<T>(prompt: string, schema: any, context?: ChatContext): Promise<T> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { fallback: true } as unknown as T;
  }

  async generateWithTools(prompt: string, tools: any[], context?: ChatContext): Promise<LLMResponse> {
    return this.chat({ recentMessages: [{ role: "user", content: prompt }] });
  }

  async streamChat(context: ChatContext, onChunk: (chunk: string) => void): Promise<LLMResponse> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    onChunk("OpenRouter Fallback Stream Response");
    return { content: "OpenRouter Fallback Stream Response", confidence: 1.0 };
  }

  async chat(context: ChatContext): Promise<LLMResponse> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { content: "OpenRouter Fallback Response", confidence: 1.0 };
  }

  async extractMemory(message: string, conversationContext?: string): Promise<MemoryCandidate | null> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { shouldRemember: true, memoryType: "fact", key: "test_fb", content: message, importance: 0.8 };
  }

  async generateWorkflow(input: string): Promise<any> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return { title: "Fallback Workflow", description: "Fallback", nodes: [], edges: [] };
  }

  async planTools(input: string): Promise<any[]> {
    this.callCount++;
    if (this.failStatus > 0 || this.failMessage) {
      const err = new Error(this.failMessage || `Fallback failure with status ${this.failStatus}`);
      (err as any).status = this.failStatus;
      throw err;
    }
    return [];
  }
}

async function runFallbackTests() {
  console.log("🧪 Starting AI Provider Fallback Test Suite...\n");
  let failed = false;

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failed = true;
      throw new Error(msg);
    }
    console.log(`✅ PASS: ${msg}`);
  };

  try {
    // --------------------------------------------------------
    // Test Provider Failure Classification
    // --------------------------------------------------------
    console.log("1️⃣ Testing isProviderFailure Error Classifier...");
    assert(isProviderFailure({ status: 429 }), "HTTP 429 classified as provider failure");
    assert(isProviderFailure({ status: 500 }), "HTTP 500 classified as provider failure");
    assert(isProviderFailure({ status: 503 }), "HTTP 503 classified as provider failure");
    assert(isProviderFailure({ message: "Quota exceeded" }), "Quota exceeded message classified as provider failure");
    assert(isProviderFailure({ message: "network failure" }), "Network failure classified as provider failure");
    assert(!isProviderFailure({ message: "Message content is required" }), "Validation error NOT classified as provider failure");
    assert(!isProviderFailure({ message: "Access token is missing" }), "Auth error NOT classified as provider failure");

    // --------------------------------------------------------
    // TEST 1: Gemini (Primary) succeeds
    // --------------------------------------------------------
    console.log("\n2️⃣ TEST 1: Primary provider succeeds (OpenRouter NOT called)...");
    const primary1 = new MockPrimaryProvider();
    const fallback1 = new MockFallbackProvider();
    const provider1 = new FallbackLLMProvider(primary1, fallback1, "openai/gpt-4o-mini", "Gemini");

    const res1 = await provider1.chat({ recentMessages: [{ role: "user", content: "Hello" }] });
    assert(res1.content === "Primary Gemini Response", "Received primary provider response");
    assert(primary1.callCount === 1, "Primary provider called once");
    assert(fallback1.callCount === 0, "Fallback provider NOT called");

    // --------------------------------------------------------
    // TEST 2: Primary fails with HTTP 429 -> OpenRouter fallback
    // --------------------------------------------------------
    console.log("\n3️⃣ TEST 2: Primary returns 429 -> Automatic OpenRouter Fallback...");
    const primary2 = new MockPrimaryProvider();
    primary2.failStatus = 429;
    primary2.failMessage = "429 Too Many Requests: Quota exceeded";
    const fallback2 = new MockFallbackProvider();
    const provider2 = new FallbackLLMProvider(primary2, fallback2, "openai/gpt-4o-mini", "Gemini");

    const res2 = await provider2.chat({ recentMessages: [{ role: "user", content: "Hello" }] });
    assert(res2.content === "OpenRouter Fallback Response", "Received fallback provider response");
    assert(primary2.callCount === 1, "Primary provider attempted");
    assert(fallback2.callCount === 1, "Fallback provider called");

    // --------------------------------------------------------
    // TEST 3: Primary fails with HTTP 503 -> OpenRouter fallback
    // --------------------------------------------------------
    console.log("\n4️⃣ TEST 3: Primary returns 503 -> Automatic OpenRouter Fallback...");
    const primary3 = new MockPrimaryProvider();
    primary3.failStatus = 503;
    primary3.failMessage = "Service Unavailable";
    const fallback3 = new MockFallbackProvider();
    const provider3 = new FallbackLLMProvider(primary3, fallback3, "openai/gpt-4o-mini", "Gemini");

    const res3 = await provider3.chat({ recentMessages: [{ role: "user", content: "Hello" }] });
    assert(res3.content === "OpenRouter Fallback Response", "Fallback response received on 503");

    // --------------------------------------------------------
    // TEST 4: Streaming fallback
    // --------------------------------------------------------
    console.log("\n5️⃣ TEST 4: Streaming mode fallback...");
    const primary4 = new MockPrimaryProvider();
    primary4.failStatus = 500;
    const fallback4 = new MockFallbackProvider();
    const provider4 = new FallbackLLMProvider(primary4, fallback4, "openai/gpt-4o-mini", "Gemini");

    let streamedChunk = "";
    const res4 = await provider4.streamChat(
      { recentMessages: [{ role: "user", content: "Stream test" }] },
      (chunk) => { streamedChunk += chunk; }
    );
    assert(streamedChunk === "OpenRouter Fallback Stream Response", "Streamed content received from fallback provider");
    assert(res4.content === "OpenRouter Fallback Stream Response", "Stream chat response object returned correctly");

    // --------------------------------------------------------
    // TEST 5: Both providers fail -> Clear final error
    // --------------------------------------------------------
    console.log("\n6️⃣ TEST 5: Both providers unavailable...");
    const primary5 = new MockPrimaryProvider();
    primary5.failStatus = 503;
    const fallback5 = new MockFallbackProvider();
    fallback5.failStatus = 500;
    fallback5.failMessage = "OpenRouter Internal Server Error";
    const provider5 = new FallbackLLMProvider(primary5, fallback5, "openai/gpt-4o-mini", "Gemini");

    let caughtErr = false;
    try {
      await provider5.chat({ recentMessages: [{ role: "user", content: "Fail test" }] });
    } catch (e: any) {
      caughtErr = true;
      assert(e.message.includes("OpenRouter Internal Server Error"), "Final error propagated cleanly when both fail");
    }
    assert(caughtErr, "Exception thrown when both providers fail");

    console.log("\n🎉 ALL AI PROVIDER FALLBACK TESTS PASSED SUCCESSFULLY! 🎉\n");
    process.exit(0);
  } catch (err: any) {
    console.error("\n❌ Fallback test failed:", err.message);
    process.exit(1);
  }
}

runFallbackTests();
