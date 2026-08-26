"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
// Load env vars from monorepo root
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../../.env") });
const database_1 = require("@brain-box-ai/database");
const auth_1 = require("@brain-box-ai/auth");
const ai_1 = require("@brain-box-ai/ai");
const voice_1 = require("@brain-box-ai/voice");
const integrations_1 = require("@brain-box-ai/integrations");
const worker_1 = require("@brain-box-ai/worker");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// ============================================================
// CORS
// ============================================================
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));
app.use(express_1.default.json());
// Audio Upload Config (Multer)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});
// ============================================================
// STRUCTURED LOGGER (server-side only, never logs secrets)
// ============================================================
function log(event, meta = {}) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...meta }));
}
async function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            error: { code: "AUTH_REQUIRED", message: "Access token is missing." },
        });
    }
    try {
        let uid;
        let email;
        let name;
        try {
            const decodedToken = await (0, auth_1.verifyFirebaseIdToken)(token);
            uid = decodedToken.uid;
            email = decodedToken.email || "";
            name = decodedToken.name || email.split("@")[0] || "User";
        }
        catch (fbErr) {
            log("AUTH_FIREBASE_VERIFY_FAILED", { reason: fbErr.message });
            return res.status(401).json({
                success: false,
                error: {
                    code: "AUTH_TOKEN_INVALID",
                    message: "Your session has expired or is invalid. Please sign in again.",
                },
            });
        }
        // Ensure User row exists in DB with Firebase UID
        await database_1.supabaseAdmin
            .from("User")
            .upsert({
            id: uid,
            email: email,
            name: name,
        }, { onConflict: "id" });
        // Look up workspace by Firebase UID
        let { data: wu, error: wuError } = await database_1.supabaseAdmin
            .from("WorkspaceUser")
            .select("workspaceId")
            .eq("userId", uid)
            .limit(1)
            .maybeSingle();
        if (wuError || !wu) {
            log("AUTH_WORKSPACE_AUTO_CREATE", { userId: uid });
            const { data: workspace, error: wsError } = await database_1.supabaseAdmin
                .from("Workspace")
                .insert({ name: "Personal Workspace" })
                .select()
                .single();
            if (wsError) {
                log("AUTH_WORKSPACE_CREATE_FAILED", { error: wsError.message });
                return res.status(500).json({
                    success: false,
                    error: {
                        code: "DATABASE_ERROR",
                        message: "Failed to initialize your workspace. Please try again.",
                    },
                });
            }
            const { error: wuLinkError } = await database_1.supabaseAdmin.from("WorkspaceUser").insert({
                workspaceId: workspace.id,
                userId: uid,
                role: "OWNER",
            });
            if (wuLinkError) {
                log("AUTH_WORKSPACE_LINK_FAILED", { error: wuLinkError.message });
                return res.status(500).json({
                    success: false,
                    error: {
                        code: "DATABASE_ERROR",
                        message: "Failed to link user to workspace. Please try again.",
                    },
                });
            }
            await database_1.supabaseAdmin.from("UserPreference").upsert({
                workspaceId: workspace.id,
                theme: "system",
                timezone: "Asia/Kolkata",
                voiceInput: true,
                voiceAutoSend: false,
                voiceResponse: false,
            }, { onConflict: "workspaceId" });
            wu = { workspaceId: workspace.id };
        }
        req.user = {
            userId: uid,
            email: email,
            workspaceId: wu.workspaceId,
        };
        next();
    }
    catch (err) {
        log("AUTH_MIDDLEWARE_ERROR", { error: err.message });
        return res.status(401).json({
            success: false,
            error: { code: "AUTH_ERROR", message: "Unable to verify your session. Please sign in again." },
        });
    }
}
// ============================================================
// 1. AUTHENTICATION & USER PROFILE
// Authentication is handled via Firebase Authentication on the client.
// All protected API routes verify the Firebase ID Token in the authenticateToken middleware.
// ============================================================
// ============================================================
// 2. CONVERSATIONS & MESSAGING
// ============================================================
app.get("/api/conversations", authenticateToken, async (req, res) => {
    try {
        const { data: conversations, error } = await database_1.supabaseAdmin
            .from("Conversation")
            .select("*")
            .eq("workspaceId", req.user.workspaceId)
            .is("archivedAt", null)
            .order("updatedAt", { ascending: false });
        if (error)
            throw error;
        res.json({ success: true, data: conversations || [] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load conversations." } });
    }
});
app.post("/api/conversations", authenticateToken, async (req, res) => {
    const { title } = req.body;
    try {
        const { data: conversation, error } = await database_1.supabaseAdmin
            .from("Conversation")
            .insert({
            workspaceId: req.user.workspaceId,
            title: title || "New Chat",
        })
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json({ success: true, data: conversation });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create conversation." } });
    }
});
app.get("/api/conversations/:id", authenticateToken, async (req, res) => {
    try {
        const { data: conversation, error: convError } = await database_1.supabaseAdmin
            .from("Conversation")
            .select("*")
            .eq("id", req.params.id)
            .eq("workspaceId", req.user.workspaceId)
            .limit(1)
            .maybeSingle();
        if (convError)
            throw convError;
        if (!conversation) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found." } });
        }
        const { data: messages, error: msgError } = await database_1.supabaseAdmin
            .from("Message")
            .select("*")
            .eq("conversationId", req.params.id)
            .order("createdAt", { ascending: true });
        if (msgError)
            throw msgError;
        conversation.messages = messages || [];
        res.json({ success: true, data: conversation });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load conversation." } });
    }
});
app.patch("/api/conversations/:id", authenticateToken, async (req, res) => {
    const { title, archived, pinned } = req.body;
    try {
        const { error } = await database_1.supabaseAdmin
            .from("Conversation")
            .update({
            ...(title !== undefined ? { title } : {}),
            ...(pinned !== undefined ? { pinned } : {}),
            ...(archived !== undefined
                ? { archivedAt: archived ? new Date().toISOString() : null }
                : {}),
        })
            .eq("id", req.params.id)
            .eq("workspaceId", req.user.workspaceId);
        if (error)
            throw error;
        res.json({ success: true, data: { status: "success" } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update conversation." } });
    }
});
app.delete("/api/conversations/:id", authenticateToken, async (req, res) => {
    try {
        const { error } = await database_1.supabaseAdmin
            .from("Conversation")
            .delete()
            .eq("id", req.params.id)
            .eq("workspaceId", req.user.workspaceId);
        if (error)
            throw error;
        res.json({ success: true, data: { status: "success" } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete conversation." } });
    }
});
// Request Idempotency Tracker
const processedRequestIds = new Map();
const REQUEST_ID_TTL_MS = 5 * 60 * 1000;
function isDuplicateRequest(clientRequestId) {
    if (!clientRequestId)
        return false;
    const now = Date.now();
    for (const [key, val] of processedRequestIds.entries()) {
        if (now - val.timestamp > REQUEST_ID_TTL_MS) {
            processedRequestIds.delete(key);
        }
    }
    if (processedRequestIds.has(clientRequestId)) {
        return true;
    }
    processedRequestIds.set(clientRequestId, { timestamp: now });
    return false;
}
// ============================================================
// 3. AI CHAT (SSE + Non-SSE) with Memory Integration
// ============================================================
app.post("/api/chat", authenticateToken, async (req, res) => {
    const { conversationId, content, useSSE, clientRequestId } = req.body;
    const workspaceId = req.user.workspaceId;
    const userId = req.user.userId;
    if (clientRequestId && isDuplicateRequest(clientRequestId)) {
        log("CHAT_DUPLICATE_REQUEST_IGNORED", { userId, clientRequestId });
        if (useSSE) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.flushHeaders();
            res.write(`data: ${JSON.stringify({ type: "message:complete", duplicated: true })}\n\n`);
            return res.end();
        }
        return res.status(200).json({ success: true, duplicated: true, message: "Duplicate request ignored." });
    }
    if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required." });
    }
    // --- Wake Phrase Detection ---
    if ((0, ai_1.isWakePhrase)(content)) {
        log("WAKE_PHRASE_DETECTED", { userId });
        // Still persist user message if we have a conversationId
        if (conversationId) {
            await database_1.supabaseAdmin.from("Message").insert({
                conversationId,
                role: "USER",
                content,
                type: "TEXT",
            });
            await database_1.supabaseAdmin.from("Message").insert({
                conversationId,
                role: "ASSISTANT",
                content: "Hey! I'm Brain Box AI — your personal automation assistant. What would you like me to do?",
                type: "TEXT",
            });
        }
        return res.json({
            wakePhraseActivated: true,
            message: {
                role: "ASSISTANT",
                content: "Hey! I'm Brain Box AI — your personal automation assistant. What would you like me to do?",
                type: "TEXT",
                createdAt: new Date().toISOString(),
            },
        });
    }
    log("CHAT_SUBMIT", { userId, conversationId: conversationId || "new", clientRequestId, contentType: "TEXT" });
    try {
        // 1. Persist User Message FIRST to eliminate context race conditions
        const userMsgRes = await database_1.supabaseAdmin
            .from("Message")
            .insert({ conversationId, role: "USER", content, type: "TEXT" })
            .select()
            .single();
        if (userMsgRes.error)
            throw userMsgRes.error;
        // 2. Fetch context sequentially AFTER user message is committed
        const [messagesListRes, summaryRes, allMemoriesRes, prefRes, userProfileRes] = await Promise.all([
            database_1.supabaseAdmin.from("Message").select("*").eq("conversationId", conversationId).order("createdAt", { ascending: false }).limit(50),
            database_1.supabaseAdmin.from("ConversationSummary").select("*").eq("conversationId", conversationId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
            database_1.supabaseAdmin.from("Memory").select("*").eq("workspaceId", workspaceId).order("updatedAt", { ascending: false }),
            database_1.supabaseAdmin.from("UserPreference").select("*").eq("workspaceId", workspaceId).limit(1).maybeSingle(),
            database_1.supabaseAdmin.from("User").select("name").eq("id", userId).maybeSingle(),
        ]);
        const recentMessages = (messagesListRes.data || []).reverse();
        const summary = summaryRes.data;
        const memoryRecords = (allMemoriesRes.data || []);
        const relevantMemories = (0, ai_1.retrieveRelevantMemories)(content, memoryRecords, 6);
        const memoriesContext = relevantMemories.map((m) => `${m.key}: ${m.value}`);
        const pref = prefRes.data;
        const userProfile = userProfileRes.data;
        const userTimezone = pref?.timezone || "Asia/Kolkata";
        log("CONTEXT_ASSEMBLED", {
            userId,
            conversationId,
            recentMessageCount: recentMessages.length,
            relevantMemoryCount: relevantMemories.length,
            timezone: userTimezone,
        });
        const context = {
            recentMessages: recentMessages.map((m) => ({
                role: m.role.toLowerCase(),
                content: m.content,
            })),
            summary: summary?.content,
            memories: memoriesContext,
            timezone: userTimezone,
            userProfile: userProfile?.name ? `User's name: ${userProfile.name}` : undefined,
        };
        log("AI_INVOKE_START", { userId, primaryProvider: "OpenRouter" });
        const provider = (0, ai_1.getLLMProvider)();
        // ---- SSE Mode ----
        if (useSSE) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.flushHeaders();
            res.write(`data: ${JSON.stringify({ type: "message:start" })}\n\n`);
            // Stream tokens in real time directly as they arrive from LLM provider
            const response = await provider.streamChat(context, (chunk) => {
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: "message:delta", content: chunk })}\n\n`);
                }
            });
            // Execute Tool Calls in parallel if multiple independent tools requested
            const executedToolResults = [];
            if (response.toolCalls && response.toolCalls.length > 0) {
                const toolPromises = response.toolCalls.map(async (call) => {
                    if (!res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ type: "tool:start", tool: call.tool })}\n\n`);
                    }
                    log("ACTION_EXECUTE", { userId, tool: call.tool });
                    try {
                        const result = await executeTool(call, workspaceId, userId, workspaceId);
                        const status = (result && (result.status === "failed" || result.error || result.success === false)) ? "failed" : "success";
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ type: status === "success" ? "tool:complete" : "tool:failed", tool: call.tool, result })}\n\n`);
                        }
                        return { tool: call.tool, status, result };
                    }
                    catch (toolErr) {
                        log("ACTION_FAILED", { userId, tool: call.tool, error: toolErr.message });
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ type: "tool:failed", tool: call.tool, error: toolErr.message })}\n\n`);
                        }
                        return { tool: call.tool, status: "failed", error: { message: toolErr.message } };
                    }
                });
                const toolResults = await Promise.all(toolPromises);
                executedToolResults.push(...toolResults);
            }
            let finalContent = response.content || "";
            if (executedToolResults.length > 0) {
                const gmailSendRes = executedToolResults.find((r) => r.tool === "gmail.send");
                if (gmailSendRes) {
                    if (gmailSendRes.result?.success || gmailSendRes.status === "success" || gmailSendRes.result?.status === "sent") {
                        const recipient = gmailSendRes.result?.to || "recipient";
                        const msgIdStr = gmailSendRes.result?.messageId ? ` (Message ID: ${gmailSendRes.result.messageId})` : "";
                        finalContent = `Done — email sent successfully to ${recipient}.${msgIdStr}`;
                    }
                    else if (gmailSendRes.status === "failed" || gmailSendRes.result?.success === false) {
                        const errObj = gmailSendRes.result?.error || gmailSendRes.error;
                        if (errObj?.code === "GOOGLE_SCOPE_MISSING" ||
                            errObj?.code === "GOOGLE_NOT_CONNECTED" ||
                            errObj?.code === "GOOGLE_AUTH_EXPIRED" ||
                            errObj?.code === "GOOGLE_REAUTH_REQUIRED") {
                            finalContent = "I couldn't send the email because Google authorization needs to be reconnected. Please reconnect Google in Settings.";
                        }
                        else if (errObj?.code === "GOOGLE_API_DISABLED" || errObj?.code === "GMAIL_API_DISABLED") {
                            finalContent = "I couldn't send the email because Gmail API is not enabled in your Google Cloud Console project.";
                        }
                        else {
                            const errMsg = errObj?.message || "Google service request failed.";
                            finalContent = `I couldn't send the email because: ${errMsg}`;
                        }
                    }
                }
                const calCreateRes = executedToolResults.find((r) => r.tool === "calendar.create");
                if (calCreateRes) {
                    if (calCreateRes.result?.success || calCreateRes.status === "success") {
                        const eventTitle = calCreateRes.result?.summary || "event";
                        const eventIdStr = calCreateRes.result?.eventId ? ` (Event ID: ${calCreateRes.result.eventId})` : "";
                        finalContent = `Done — the "${eventTitle}" event was added to your Google Calendar.${eventIdStr}`;
                    }
                    else if (calCreateRes.status === "failed" || calCreateRes.result?.success === false) {
                        const errObj = calCreateRes.result?.error || calCreateRes.error;
                        if (errObj?.code === "GOOGLE_REAUTH_REQUIRED" ||
                            errObj?.code === "GOOGLE_AUTH_EXPIRED") {
                            finalContent = "I couldn't create the event because Google authorization needs to be reconnected. Please reconnect Google in Settings.";
                        }
                        else if (errObj?.code === "GOOGLE_API_DISABLED") {
                            finalContent = "I couldn't create the event because Google Calendar API is not enabled in your Google Cloud Console project.";
                        }
                        else {
                            const errMsg = errObj?.message || "Google Calendar API request failed.";
                            finalContent = `I couldn't create the calendar event because: ${errMsg}`;
                        }
                    }
                }
            }
            if (finalContent.trim().startsWith("{") && finalContent.includes("toolCalls")) {
                finalContent = executedToolResults.length > 0 ? "Action executed." : "";
            }
            // Persist assistant message
            const { data: assistantMessage } = await database_1.supabaseAdmin
                .from("Message")
                .insert({
                conversationId,
                role: "ASSISTANT",
                content: finalContent,
                type: response.needsClarification ? "APPROVAL" : "TEXT",
                metadata: {
                    toolCalls: response.toolCalls || [],
                    toolResults: executedToolResults,
                    clarification: response.needsClarification
                        ? { question: response.question }
                        : undefined,
                },
            })
                .select()
                .single();
            log("CHAT_RESPONSE_SAVED", { userId, conversationId, messageId: assistantMessage?.id });
            res.write(`data: ${JSON.stringify({ type: "message:complete", message: assistantMessage })}\n\n`);
            res.end();
            // Post-response (Async background execution)
            (async () => {
                if (recentMessages.length <= 3) {
                    try {
                        const titleGen = await provider.chat({
                            recentMessages: [
                                {
                                    role: "system",
                                    content: "Generate a concise 2-4 word title for this conversation. Respond with ONLY the title text, no quotes.",
                                },
                                { role: "user", content },
                            ],
                        });
                        const title = titleGen.content.replace(/[\"']/g, "").trim().slice(0, 60);
                        if (title) {
                            await database_1.supabaseAdmin
                                .from("Conversation")
                                .update({ title, updatedAt: new Date().toISOString() })
                                .eq("id", conversationId);
                        }
                    }
                    catch (e) { }
                }
                try {
                    await extractAndSaveMemory(provider, content, workspaceId, conversationId, userId);
                }
                catch (e) { }
            })();
        }
        else {
            // ---- Non-SSE Mode ----
            const response = await provider.chat(context);
            const executedToolResults = [];
            if (response.toolCalls && response.toolCalls.length > 0) {
                const toolPromises = response.toolCalls.map(async (call) => {
                    log("ACTION_EXECUTE", { userId, tool: call.tool });
                    try {
                        const result = await executeTool(call, workspaceId, userId, workspaceId);
                        const status = (result && (result.status === "failed" || result.error || result.success === false)) ? "failed" : "success";
                        return { tool: call.tool, status, result };
                    }
                    catch (e) {
                        log("ACTION_FAILED", { userId, tool: call.tool, error: e.message });
                        return { tool: call.tool, status: "failed", error: { message: e.message } };
                    }
                });
                const toolResults = await Promise.all(toolPromises);
                executedToolResults.push(...toolResults);
            }
            let finalContent = response.content || "";
            if (executedToolResults.length > 0) {
                const gmailSendRes = executedToolResults.find((r) => r.tool === "gmail.send");
                if (gmailSendRes) {
                    if (gmailSendRes.result?.success || gmailSendRes.status === "success" || gmailSendRes.result?.status === "sent") {
                        const recipient = gmailSendRes.result?.to || "recipient";
                        const msgIdStr = gmailSendRes.result?.messageId ? ` (Message ID: ${gmailSendRes.result.messageId})` : "";
                        finalContent = `Done — the email was sent successfully to ${recipient}.${msgIdStr}`;
                    }
                    else if (gmailSendRes.status === "failed" || gmailSendRes.result?.success === false) {
                        const errObj = gmailSendRes.result?.error || gmailSendRes.result || gmailSendRes.error;
                        if (errObj?.code === "GOOGLE_SCOPE_MISSING" ||
                            errObj?.code === "GOOGLE_NOT_CONNECTED" ||
                            errObj?.code === "GOOGLE_AUTH_EXPIRED" ||
                            errObj?.code === "GOOGLE_REAUTH_REQUIRED") {
                            finalContent = "I couldn't send the email because Google authorization needs to be reconnected. Please reconnect Google in Settings.";
                        }
                        else if (errObj?.code === "GOOGLE_API_DISABLED" || errObj?.code === "GMAIL_API_DISABLED" || errObj?.errorCode === "GOOGLE_API_DISABLED") {
                            finalContent = "I couldn't send the email because Gmail API is not enabled in your Google Cloud Console project.";
                        }
                        else {
                            const errMsg = errObj?.message || "Google service request failed.";
                            finalContent = `I couldn't send the email because: ${errMsg}`;
                        }
                    }
                }
                const calCreateRes = executedToolResults.find((r) => r.tool === "calendar.create");
                if (calCreateRes) {
                    if (calCreateRes.result?.success || calCreateRes.status === "success") {
                        const eventTitle = calCreateRes.result?.summary || "event";
                        const eventIdStr = calCreateRes.result?.eventId ? ` (Event ID: ${calCreateRes.result.eventId})` : "";
                        finalContent = `Done — the "${eventTitle}" event was added to your Google Calendar.${eventIdStr}`;
                    }
                    else if (calCreateRes.status === "failed" || calCreateRes.result?.success === false) {
                        const errObj = calCreateRes.result?.error || calCreateRes.result || calCreateRes.error;
                        if (errObj?.code === "GOOGLE_REAUTH_REQUIRED" ||
                            errObj?.code === "GOOGLE_AUTH_EXPIRED") {
                            finalContent = "I couldn't create the event because Google authorization needs to be reconnected. Please reconnect Google in Settings.";
                        }
                        else if (errObj?.code === "GOOGLE_API_DISABLED" || errObj?.errorCode === "GOOGLE_API_DISABLED") {
                            finalContent = "I couldn't create the event because Google Calendar API is not enabled in your Google Cloud Console project.";
                        }
                        else {
                            const errMsg = errObj?.message || "Google Calendar API request failed.";
                            finalContent = `I couldn't create the calendar event because: ${errMsg}`;
                        }
                    }
                }
            }
            if (finalContent.trim().startsWith("{") && finalContent.includes("toolCalls")) {
                finalContent = executedToolResults.length > 0 ? "Action executed." : "";
            }
            const { data: assistantMessage } = await database_1.supabaseAdmin
                .from("Message")
                .insert({
                conversationId,
                role: "ASSISTANT",
                content: finalContent,
                type: response.needsClarification ? "APPROVAL" : "TEXT",
                metadata: {
                    toolCalls: response.toolCalls,
                    toolResults: executedToolResults,
                    clarification: response.needsClarification
                        ? { question: response.question }
                        : undefined,
                },
            })
                .select()
                .single();
            res.json({ success: true, data: { message: assistantMessage } });
            (async () => {
                try {
                    await extractAndSaveMemory(provider, content, workspaceId, conversationId, userId);
                }
                catch (e) { }
            })();
        }
    }
    catch (err) {
        const rawErrorMsg = err.message || err.error?.message || String(err);
        log("CHAT_ERROR", { userId, error: rawErrorMsg });
        let userFacingMessage = rawErrorMsg;
        if (rawErrorMsg.includes("429") || rawErrorMsg.toLowerCase().includes("quota")) {
            userFacingMessage = "The AI service is experiencing temporary rate limits. Please try again in a moment.";
        }
        else if (rawErrorMsg.includes("404") || rawErrorMsg.includes("no longer available")) {
            userFacingMessage = "AI service model configuration error. Please try again.";
        }
        else if (rawErrorMsg.toLowerCase().includes("unavailable") || rawErrorMsg.toLowerCase().includes("failed")) {
            userFacingMessage = "AI service is currently unavailable. Please try again in a moment.";
        }
        if (useSSE && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: "message:error", error: userFacingMessage })}\n\n`);
            res.end();
        }
        else if (!res.headersSent) {
            if (err.error && err.success === false) {
                res.status(err.error.code === "AUTH_ERROR" ? 401 : 500).json(err);
            }
            else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: "CHAT_ERROR",
                        message: userFacingMessage
                    }
                });
            }
        }
    }
});
const toolCallStore = new Map();
const TOOL_CALL_TTL_MS = 10 * 60 * 1000; // 10 minutes
function cleanupToolCallStore() {
    const now = Date.now();
    for (const [k, v] of toolCallStore.entries()) {
        if (now - v.createdAt > TOOL_CALL_TTL_MS) {
            toolCallStore.delete(k);
        }
    }
}
async function executeTool(call, workspaceId, userId, _wsId) {
    const { tool, arguments: args } = call;
    cleanupToolCallStore();
    const toolCallId = call.toolCallId || call.id || `${userId}:${tool}:${args.to || ""}:${args.subject || ""}:${args.body || ""}`;
    if (toolCallStore.has(toolCallId)) {
        const existing = toolCallStore.get(toolCallId);
        log("TOOL_CALL_DEDUPLICATED", { userId, tool, toolCallId, status: existing.status });
        return existing.result;
    }
    // Set transient pending record
    toolCallStore.set(toolCallId, {
        toolCallId,
        status: "PENDING",
        result: null,
        createdAt: Date.now(),
    });
    // Fetch workspace user timezone preference
    let userTimezone = "Asia/Kolkata";
    try {
        const { data: pref } = await database_1.supabaseAdmin.from("UserPreference").select("timezone").eq("workspaceId", workspaceId).maybeSingle();
        if (pref?.timezone)
            userTimezone = pref.timezone;
    }
    catch { }
    try {
        let result;
        if (tool === "calendar.create") {
            log("CALENDAR CREATE", { userId, title: args.title, startTime: args.startTime, timezone: userTimezone });
            const { CalendarProvider } = await import("@brain-box-ai/integrations");
            const cal = new CalendarProvider(userId);
            result = await cal.create(args.title, args.startTime, args.durationMinutes || 30, args.description, userTimezone);
        }
        else if (tool === "calendar.list") {
            log("CALENDAR READ", { userId, timeRange: args.timeRange, timezone: userTimezone });
            const { CalendarProvider } = await import("@brain-box-ai/integrations");
            const cal = new CalendarProvider(userId);
            result = await cal.list(args.timeRange, userTimezone);
        }
        else if (tool === "calendar.delete") {
            const { CalendarProvider } = await import("@brain-box-ai/integrations");
            const cal = new CalendarProvider(userId);
            result = await cal.delete(args.eventId);
        }
        else if (tool === "gmail.send") {
            log("GMAIL SEND", { userId, to: args.to, subject: args.subject });
            const { GmailProvider } = await import("@brain-box-ai/integrations");
            const mail = new GmailProvider(userId);
            result = await mail.send(args.to, args.subject, args.body);
        }
        else if (tool === "gmail.draft") {
            const { GmailProvider } = await import("@brain-box-ai/integrations");
            const mail = new GmailProvider(userId);
            result = await mail.draft(args.to, args.subject, args.body);
        }
        else if (tool === "gmail.search") {
            const { GmailProvider } = await import("@brain-box-ai/integrations");
            const mail = new GmailProvider(userId);
            result = await mail.search(args.query);
        }
        else if (tool === "telegram.sendMessage") {
            const { MessagingProvider } = await import("@brain-box-ai/integrations");
            result = await MessagingProvider.sendTelegram(args.message);
        }
        else if (tool === "discord.sendMessage") {
            const { MessagingProvider } = await import("@brain-box-ai/integrations");
            result = await MessagingProvider.sendDiscord(args.message);
        }
        else if (tool === "slack.sendMessage") {
            const { MessagingProvider } = await import("@brain-box-ai/integrations");
            result = await MessagingProvider.sendSlack(args.channel, args.message);
        }
        else if (tool === "memory.save") {
            const content = args.content || args.value || "";
            const key = args.key || `memory_${Date.now()}`;
            const memType = args.type || "instruction";
            const importance = typeof args.importance === "number" ? args.importance : 0.8;
            let res = await database_1.supabaseAdmin.from("Memory").upsert({
                workspaceId,
                type: memType,
                key,
                value: content,
                importance,
                updatedAt: new Date().toISOString(),
            }, { onConflict: "workspaceId,type,key" });
            if (res.error && res.error.message?.includes("column")) {
                res = await database_1.supabaseAdmin.from("Memory").upsert({ workspaceId, type: memType, key, value: content, updatedAt: new Date().toISOString() }, { onConflict: "workspaceId,type,key" });
            }
            if (res.error)
                throw res.error;
            log("MEMORY_CREATED", { userId, key, type: memType });
            result = { status: "success", saved: content };
        }
        else if (tool === "memory.delete") {
            const query = args.query || args.key || "";
            await database_1.supabaseAdmin
                .from("Memory")
                .delete()
                .eq("workspaceId", workspaceId)
                .or(`value.ilike.%${query}%,key.ilike.%${query}%`);
            log("MEMORY_DELETED", { userId, query });
            result = { status: "success" };
        }
        else if (tool === "workflow.create") {
            const { data: workflow } = await database_1.supabaseAdmin
                .from("Workflow")
                .insert({
                workspaceId,
                title: args.title || "AI Generated Workflow",
                description: args.description || "",
                status: "DRAFT",
            })
                .select()
                .single();
            if (workflow) {
                await database_1.supabaseAdmin.from("WorkflowVersion").insert({
                    workflowId: workflow.id,
                    version: 1,
                    nodes: args.nodes || [],
                    edges: args.edges || [],
                });
            }
            result = { status: "success", workflowId: workflow?.id };
        }
        else if (tool === "calendar.update") {
            const { CalendarProvider } = await import("@brain-box-ai/integrations");
            const cal = new CalendarProvider(userId);
            result = await cal.update(args.eventId, args.updates || args);
        }
        else if (tool === "drive.search") {
            const { DriveProvider } = await import("@brain-box-ai/integrations");
            const drive = new DriveProvider(userId);
            result = await drive.search(args.query);
        }
        else if (tool === "drive.list") {
            const { DriveProvider } = await import("@brain-box-ai/integrations");
            const drive = new DriveProvider(userId);
            result = await drive.list(args.pageSize);
        }
        else if (tool === "drive.read") {
            const { DriveProvider } = await import("@brain-box-ai/integrations");
            const drive = new DriveProvider(userId);
            result = await drive.read(args.fileId);
        }
        else if (tool === "drive.create") {
            const { DriveProvider } = await import("@brain-box-ai/integrations");
            const drive = new DriveProvider(userId);
            result = await drive.create(args.name, args.content, args.mimeType);
        }
        else if (tool === "drive.update") {
            const { DriveProvider } = await import("@brain-box-ai/integrations");
            const drive = new DriveProvider(userId);
            result = await drive.update(args.fileId, args.content);
        }
        else if (tool === "sheets.find") {
            const { SheetsProvider } = await import("@brain-box-ai/integrations");
            const sheets = new SheetsProvider(userId);
            result = await sheets.find(args.title);
        }
        else if (tool === "sheets.read") {
            const { SheetsProvider } = await import("@brain-box-ai/integrations");
            const sheets = new SheetsProvider(userId);
            result = await sheets.readSheet(args.spreadsheetId, args.range);
        }
        else if (tool === "sheets.append") {
            const { SheetsProvider } = await import("@brain-box-ai/integrations");
            const sheets = new SheetsProvider(userId);
            result = await sheets.appendRow(args.spreadsheetId, args.values || [args.value], args.range);
        }
        else if (tool === "sheets.write") {
            const { SheetsProvider } = await import("@brain-box-ai/integrations");
            const sheets = new SheetsProvider(userId);
            result = await sheets.writeCell(args.spreadsheetId, args.range, args.values);
        }
        else if (tool === "activepieces.triggerFlow") {
            const { ActivepiecesService } = await import("@brain-box-ai/integrations");
            const ap = new ActivepiecesService();
            result = await ap.triggerFlow(args.flowId, args.payload || {});
        }
        else if (tool === "activepieces.listConnections") {
            const { ActivepiecesService } = await import("@brain-box-ai/integrations");
            const ap = new ActivepiecesService();
            result = await ap.listConnections(userId);
        }
        else {
            log("TOOL_UNKNOWN", { userId, tool });
            result = { status: "simulated", info: `Tool ${tool} is not yet implemented.` };
        }
        const isSuccess = result && result.success !== false && result.status !== "failed" && !result.error;
        toolCallStore.set(toolCallId, {
            toolCallId,
            status: isSuccess ? "SUCCESS" : "FAILED",
            result,
            createdAt: Date.now(),
        });
        if (isSuccess) {
            log("ACTION_EXECUTION_SUCCESS", { userId, tool });
        }
        else {
            log("ACTION_EXECUTION_FAILED", { userId, tool, error: result?.message || result?.error?.message });
        }
        return result;
    }
    catch (err) {
        const errorRes = { success: false, status: "failed", error: { code: "TOOL_EXECUTION_ERROR", message: err.message }, message: err.message };
        toolCallStore.set(toolCallId, {
            toolCallId,
            status: "FAILED",
            result: errorRes,
            createdAt: Date.now(),
        });
        log("ACTION_EXECUTION_FAILED", { userId, tool, error: err.message });
        return errorRes;
    }
}
// ============================================================
// MEMORY EXTRACTION HELPER
// ============================================================
async function extractAndSaveMemory(provider, userMessage, workspaceId, conversationId, userId) {
    try {
        const candidate = await provider.extractMemory(userMessage);
        if (candidate && candidate.shouldRemember) {
            let upsertResult = await database_1.supabaseAdmin.from("Memory").upsert({
                workspaceId,
                type: candidate.memoryType,
                key: candidate.key,
                value: candidate.content,
                importance: candidate.importance,
                sourceConversationId: conversationId,
                updatedAt: new Date().toISOString(),
            }, { onConflict: "workspaceId,type,key" });
            if (upsertResult.error && upsertResult.error.message?.includes("column")) {
                upsertResult = await database_1.supabaseAdmin.from("Memory").upsert({
                    workspaceId,
                    type: candidate.memoryType,
                    key: candidate.key,
                    value: candidate.content,
                    updatedAt: new Date().toISOString(),
                }, { onConflict: "workspaceId,type,key" });
            }
            if (!upsertResult.error) {
                log("MEMORY_CREATED", {
                    userId,
                    key: candidate.key,
                    type: candidate.memoryType,
                    importance: candidate.importance,
                });
            }
        }
    }
    catch (e) {
        log("MEMORY_EXTRACTION_FAILED", { userId, error: e.message });
    }
}
// ============================================================
// 4. MEMORY API
// ============================================================
app.get("/api/memory", authenticateToken, async (req, res) => {
    try {
        const { data: memories, error } = await database_1.supabaseAdmin
            .from("Memory")
            .select("*")
            .eq("workspaceId", req.user.workspaceId)
            .order("updatedAt", { ascending: false });
        if (error)
            throw error;
        res.json({ success: true, data: memories || [] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load memories." } });
    }
});
app.post("/api/memory", authenticateToken, async (req, res) => {
    const { key, value, type, importance } = req.body;
    if (!key || !value) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Memory key and value are required." } });
    }
    const workspaceId = req.user.workspaceId;
    try {
        let result = await database_1.supabaseAdmin
            .from("Memory")
            .upsert({
            workspaceId,
            type: type || "fact",
            key,
            value,
            importance: typeof importance === "number" ? importance : 0.5,
            updatedAt: new Date().toISOString(),
        }, { onConflict: "workspaceId,type,key" })
            .select()
            .single();
        if (result.error && result.error.message?.includes("column")) {
            log("MEMORY_FALLBACK_INSERT", { reason: result.error.message });
            result = await database_1.supabaseAdmin
                .from("Memory")
                .upsert({ workspaceId, type: type || "fact", key, value, updatedAt: new Date().toISOString() }, { onConflict: "workspaceId,type,key" })
                .select()
                .single();
        }
        if (result.error)
            throw result.error;
        log("MEMORY_CREATED", { userId: req.user.userId, key, type });
        res.status(201).json({ success: true, data: result.data });
    }
    catch (err) {
        log("MEMORY_POST_ERROR", { error: err.message });
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to save memory." } });
    }
});
app.patch("/api/memory/:id", authenticateToken, async (req, res) => {
    const { value, type, importance } = req.body;
    try {
        const { data, error } = await database_1.supabaseAdmin
            .from("Memory")
            .update({
            ...(value !== undefined ? { value } : {}),
            ...(type !== undefined ? { type } : {}),
            ...(importance !== undefined ? { importance } : {}),
            updatedAt: new Date().toISOString(),
        })
            .eq("id", req.params.id)
            .eq("workspaceId", req.user.workspaceId)
            .select()
            .single();
        if (error)
            throw error;
        if (!data)
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Memory not found." } });
        res.json({ success: true, data: data });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update memory." } });
    }
});
app.delete("/api/memory/all", authenticateToken, async (req, res) => {
    try {
        const { error } = await database_1.supabaseAdmin
            .from("Memory")
            .delete()
            .eq("workspaceId", req.user.workspaceId);
        if (error)
            throw error;
        log("MEMORY_CLEARED", { userId: req.user.userId });
        res.json({ success: true, data: { status: "success", message: "All memories cleared." } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to clear memories." } });
    }
});
app.delete("/api/memory/:id", authenticateToken, async (req, res) => {
    try {
        const { error } = await database_1.supabaseAdmin
            .from("Memory")
            .delete()
            .eq("id", req.params.id)
            .eq("workspaceId", req.user.workspaceId);
        if (error)
            throw error;
        log("MEMORY_DELETED", { userId: req.user.userId, id: req.params.id });
        res.json({ success: true, data: { status: "success" } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete memory." } });
    }
});
// ============================================================
// 5. WORKFLOWS
// ============================================================
app.get("/api/workflows", authenticateToken, async (req, res) => {
    try {
        const { data: workflows, error } = await database_1.supabaseAdmin
            .from("Workflow")
            .select("*, schedules:Schedule(*)")
            .eq("workspaceId", req.user.workspaceId)
            .order("updatedAt", { ascending: false });
        if (error)
            throw error;
        res.json({ success: true, data: workflows || [] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load workflows." } });
    }
});
app.get("/api/workflows/:id", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        const { data: workflow, error: wfError } = await database_1.supabaseAdmin
            .from("Workflow")
            .select("*, versions:WorkflowVersion(*)")
            .eq("id", req.params.id)
            .eq("workspaceId", workspaceId)
            .limit(1)
            .maybeSingle();
        if (wfError)
            throw wfError;
        if (!workflow)
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Workflow not found." } });
        if (workflow.versions) {
            workflow.versions.sort((a, b) => b.version - a.version);
        }
        const latestVersion = workflow.versions?.[0] || { nodes: [], edges: [] };
        res.json({ success: true, data: { ...workflow, nodes: latestVersion.nodes, edges: latestVersion.edges } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load workflow." } });
    }
});
app.post("/api/workflows", authenticateToken, async (req, res) => {
    const { title, description, nodes, edges, conversationId } = req.body;
    try {
        const { data: workflow, error: wfError } = await database_1.supabaseAdmin
            .from("Workflow")
            .insert({
            workspaceId: req.user.workspaceId,
            title: title || "Unnamed Workflow",
            description,
            conversationId,
            status: "DRAFT",
        })
            .select()
            .single();
        if (wfError)
            throw wfError;
        await database_1.supabaseAdmin.from("WorkflowVersion").insert({
            workflowId: workflow.id,
            version: 1,
            nodes: nodes || [],
            edges: edges || [],
        });
        log("WORKFLOW_CREATED", { userId: req.user.userId, workflowId: workflow.id });
        res.status(201).json({ success: true, data: workflow });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create workflow." } });
    }
});
app.patch("/api/workflows/:id", authenticateToken, async (req, res) => {
    const { title, description, nodes, edges } = req.body;
    const workspaceId = req.user.workspaceId;
    try {
        const { data: workflow, error: fetchError } = await database_1.supabaseAdmin
            .from("Workflow")
            .select("*")
            .eq("id", req.params.id)
            .eq("workspaceId", workspaceId)
            .limit(1)
            .maybeSingle();
        if (fetchError || !workflow)
            return res.status(404).json({ error: "Workflow not found." });
        const nextVersion = workflow.version + 1;
        await database_1.supabaseAdmin
            .from("Workflow")
            .update({
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            version: nextVersion,
        })
            .eq("id", workflow.id);
        await database_1.supabaseAdmin.from("WorkflowVersion").insert({
            workflowId: workflow.id,
            version: nextVersion,
            nodes: nodes || [],
            edges: edges || [],
        });
        res.json({ status: "success", version: nextVersion });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to update workflow." });
    }
});
app.post("/api/workflows/:id/activate", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        const { data: workflow, error: fetchError } = await database_1.supabaseAdmin
            .from("Workflow")
            .select("*, versions:WorkflowVersion(*)")
            .eq("id", req.params.id)
            .eq("workspaceId", workspaceId)
            .limit(1)
            .maybeSingle();
        if (fetchError || !workflow)
            return res.status(404).json({ error: "Workflow not found." });
        if (workflow.versions) {
            workflow.versions.sort((a, b) => b.version - a.version);
        }
        if (!workflow.versions || workflow.versions.length === 0) {
            return res.status(400).json({ error: "Workflow has no configurations." });
        }
        await database_1.supabaseAdmin.from("Workflow").update({ status: "ACTIVE" }).eq("id", workflow.id);
        const nodes = workflow.versions[0].nodes;
        const scheduleNode = nodes.find((n) => n.type === "trigger.schedule");
        if (scheduleNode && scheduleNode.data?.cron) {
            const cron = scheduleNode.data.cron;
            const timezone = scheduleNode.data.timezone || "Asia/Kolkata";
            const nextRun = (0, worker_1.calculateNextRun)(cron, timezone);
            await database_1.supabaseAdmin.from("Schedule").delete().eq("workflowId", workflow.id);
            await database_1.supabaseAdmin.from("Schedule").insert({
                workflowId: workflow.id,
                cron,
                timezone,
                nextRun: nextRun.toISOString(),
            });
        }
        log("WORKFLOW_ACTIVATED", { userId: req.user.userId, workflowId: workflow.id });
        res.json({ status: "success", info: "Workflow activated." });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to activate workflow." });
    }
});
app.post("/api/workflows/:id/pause", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        await database_1.supabaseAdmin
            .from("Workflow")
            .update({ status: "PAUSED" })
            .eq("id", req.params.id)
            .eq("workspaceId", workspaceId);
        await database_1.supabaseAdmin.from("Schedule").delete().eq("workflowId", req.params.id);
        res.json({ status: "success", info: "Workflow paused." });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to pause workflow." });
    }
});
app.post("/api/workflows/:id/test", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        const { data: workflow, error: fetchError } = await database_1.supabaseAdmin
            .from("Workflow")
            .select("*")
            .eq("id", req.params.id)
            .eq("workspaceId", workspaceId)
            .limit(1)
            .maybeSingle();
        if (fetchError || !workflow)
            return res.status(404).json({ error: "Workflow not found." });
        const { data: execution, error: execError } = await database_1.supabaseAdmin
            .from("Execution")
            .insert({
            workflowId: workflow.id,
            status: "RUNNING",
            triggerType: "manual",
            startedAt: new Date().toISOString(),
        })
            .select()
            .single();
        if (execError)
            throw execError;
        await worker_1.WorkerQueue.getInstance().addJob({
            type: "workflow.execute",
            workspaceId,
            executionId: execution.id,
            workflowId: workflow.id,
            triggerNodeId: "node_trigger",
            triggerData: { manualTest: true },
        });
        log("WORKFLOW_STARTED", { userId: req.user.userId, workflowId: workflow.id, executionId: execution.id });
        res.json({ executionId: execution.id, status: "RUNNING" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to test workflow." });
    }
});
// ============================================================
// 6. EXECUTIONS
// ============================================================
app.get("/api/executions", authenticateToken, async (req, res) => {
    try {
        const { data: executions, error } = await database_1.supabaseAdmin
            .from("Execution")
            .select("*, workflow:Workflow!inner(title, workspaceId)")
            .eq("workflow.workspaceId", req.user.workspaceId)
            .order("startedAt", { ascending: false });
        if (error)
            throw error;
        res.json(executions || []);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to load executions." });
    }
});
app.get("/api/executions/:id", authenticateToken, async (req, res) => {
    try {
        const { data: execution, error: execError } = await database_1.supabaseAdmin
            .from("Execution")
            .select("*, steps:ExecutionStep(*), workflow:Workflow!inner(workspaceId)")
            .eq("id", req.params.id)
            .eq("workflow.workspaceId", req.user.workspaceId)
            .limit(1)
            .maybeSingle();
        if (execError)
            throw execError;
        if (!execution)
            return res.status(404).json({ error: "Execution not found." });
        if (execution.steps) {
            execution.steps.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
        }
        res.json(execution);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to load execution." });
    }
});
// ============================================================
// 7. HUMAN APPROVALS
// ============================================================
app.get("/api/approvals", authenticateToken, async (req, res) => {
    try {
        const { data: approvals, error } = await database_1.supabaseAdmin
            .from("Approval")
            .select("*, workflow:Workflow!inner(title, workspaceId)")
            .eq("workflow.workspaceId", req.user.workspaceId)
            .order("createdAt", { ascending: false });
        if (error)
            throw error;
        res.json(approvals || []);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to load approvals." });
    }
});
app.post("/api/approvals/:id/approve", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        const { data: approval, error: fetchError } = await database_1.supabaseAdmin
            .from("Approval")
            .select("*, workflow:Workflow!inner(workspaceId)")
            .eq("id", req.params.id)
            .eq("workflow.workspaceId", workspaceId)
            .limit(1)
            .maybeSingle();
        if (fetchError || !approval || approval.status !== "PENDING") {
            return res.status(400).json({ error: "Pending approval not found." });
        }
        await database_1.supabaseAdmin
            .from("Approval")
            .update({ status: "APPROVED", respondedAt: new Date().toISOString() })
            .eq("id", approval.id);
        const { data: step } = await database_1.supabaseAdmin
            .from("ExecutionStep")
            .select("*")
            .eq("executionId", approval.executionId)
            .eq("nodeId", approval.nodeId)
            .limit(1)
            .maybeSingle();
        if (step) {
            await database_1.supabaseAdmin
                .from("ExecutionStep")
                .update({ status: "SUCCESS", finishedAt: new Date().toISOString() })
                .eq("id", step.id);
        }
        await worker_1.WorkerQueue.getInstance().addJob({
            type: "workflow.resume",
            workspaceId,
            executionId: approval.executionId,
            workflowId: approval.workflowId,
            resumedNodeId: approval.nodeId,
            resumedData: { approved: true, details: approval.details },
        });
        res.json({ status: "success", info: "Action approved and workflow resumed." });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to approve action." });
    }
});
app.post("/api/approvals/:id/reject", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        const { data: approval, error: fetchError } = await database_1.supabaseAdmin
            .from("Approval")
            .select("*, workflow:Workflow!inner(workspaceId)")
            .eq("id", req.params.id)
            .eq("workflow.workspaceId", workspaceId)
            .limit(1)
            .maybeSingle();
        if (fetchError || !approval || approval.status !== "PENDING") {
            return res.status(400).json({ error: "Pending approval not found." });
        }
        await database_1.supabaseAdmin
            .from("Approval")
            .update({ status: "REJECTED", respondedAt: new Date().toISOString() })
            .eq("id", approval.id);
        const { data: step } = await database_1.supabaseAdmin
            .from("ExecutionStep")
            .select("*")
            .eq("executionId", approval.executionId)
            .eq("nodeId", approval.nodeId)
            .limit(1)
            .maybeSingle();
        if (step) {
            await database_1.supabaseAdmin
                .from("ExecutionStep")
                .update({
                status: "FAILED",
                finishedAt: new Date().toISOString(),
                error: "Rejected by human operator.",
            })
                .eq("id", step.id);
        }
        await database_1.supabaseAdmin
            .from("Execution")
            .update({ status: "FAILED", finishedAt: new Date().toISOString() })
            .eq("id", approval.executionId);
        res.json({ status: "success", info: "Action rejected. Workflow halted." });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to reject action." });
    }
});
// ============================================================
// 8. VOICE TRANSCRIPTION
// ============================================================
app.post("/api/voice/transcribe", authenticateToken, upload.single("audio"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Audio file is required." });
    }
    log("VOICE INPUT", { userId: req.user.userId, mimeType: req.file.mimetype, size: req.file.size });
    try {
        const provider = (0, voice_1.getVoiceProvider)();
        const mimeType = req.file.mimetype || "audio/wav";
        const transcript = await provider.transcribe(req.file.buffer, mimeType);
        res.json({ transcript });
    }
    catch (err) {
        log("VOICE_TRANSCRIPTION_ERROR", { error: err.message });
        res.status(500).json({ error: "Voice transcription failed. Please try again." });
    }
});
// ============================================================
// 9. INTEGRATIONS & OAUTH
// ============================================================
app.get("/api/integrations", authenticateToken, async (req, res) => {
    const workspaceId = req.user.workspaceId;
    try {
        const { data: credentials, error } = await database_1.supabaseAdmin
            .from("Credential")
            .select("id, type, name, createdAt")
            .eq("workspaceId", workspaceId);
        if (error)
            throw error;
        res.json({
            success: true,
            data: {
                credentials: credentials || [],
            }
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: {
                code: "DATABASE_ERROR",
                message: "Failed to load integrations."
            }
        });
    }
});
/**
 * GET /api/integrations/google/connect & GET /api/auth/google
 * Initiates Google OAuth 2.0 flow with offline access & consent prompt.
 */
const handleGoogleConnect = (req, res) => {
    const { userId, workspaceId } = req.user;
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({
            error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment.",
        });
    }
    const oauth2Client = (0, integrations_1.getGoogleOAuth2Client)();
    const state = (0, integrations_1.generateOAuthState)(userId, workspaceId);
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: integrations_1.REQUIRED_GOOGLE_SCOPES,
        state,
        prompt: "consent",
    });
    log("GOOGLE_OAUTH_START", { userId, workspaceId });
    res.json({ url: authUrl });
};
app.get("/api/integrations/google/connect", authenticateToken, handleGoogleConnect);
app.get("/api/auth/google", authenticateToken, handleGoogleConnect);
/**
 * GET /api/integrations/google/callback & GET /api/auth/google/callback
 * Handles Google OAuth redirect, code exchange, refresh token storage with preservation.
 */
const handleGoogleCallback = async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;
    if (error) {
        log("OAUTH_CALLBACK_DENIED", { error });
        return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/settings?tab=integrations&error=access_denied`);
    }
    if (!code || !state) {
        return res.status(400).send("Missing code or state parameter.");
    }
    let userId;
    let workspaceId;
    try {
        const stateData = (0, integrations_1.consumeOAuthState)(state);
        userId = stateData.userId;
        workspaceId = stateData.workspaceId;
    }
    catch (stateErr) {
        log("OAUTH_STATE_INVALID", { reason: stateErr.message });
        return res.status(400).send(`Invalid OAuth state: ${stateErr.message}`);
    }
    try {
        const oauth2Client = (0, integrations_1.getGoogleOAuth2Client)();
        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens.access_token) {
            throw new Error("Google did not return an access token.");
        }
        oauth2Client.setCredentials(tokens);
        const oauth2 = integrations_1.google.oauth2({ version: "v2", auth: oauth2Client });
        let gmailEmail = "";
        try {
            const userInfo = await oauth2.userinfo.get();
            gmailEmail = userInfo.data.email || "";
        }
        catch { }
        const { saveGoogleCredential, validateGoogleConnection } = await import("@brain-box-ai/integrations");
        await saveGoogleCredential(workspaceId, tokens, gmailEmail);
        // Live test capabilities after storing credentials
        const capabilityStatus = await validateGoogleConnection(userId);
        log("GOOGLE_OAUTH_CALLBACK", {
            userId,
            email: gmailEmail,
            status: capabilityStatus.status,
            gmailAvailable: capabilityStatus.gmail.available,
            calendarAvailable: capabilityStatus.calendar.available,
        });
        const redirectUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/settings?tab=integrations&connected=google`;
        res.redirect(redirectUrl);
    }
    catch (err) {
        log("GOOGLE_API_ERROR", { userId, action: "oauth_callback", error: err.message });
        res.status(500).send(`Authentication failed: ${err.message}`);
    }
};
app.get("/api/integrations/google/callback", handleGoogleCallback);
app.get("/api/auth/google/callback", handleGoogleCallback);
/**
 * GET /api/integrations/google/gmail/status & GET /api/integrations/google/status
 * Returns real, verified diagnostic information about Gmail connection.
 * NEVER returns secrets, access tokens, or refresh tokens.
 */
const handleGoogleStatus = async (req, res) => {
    try {
        const { validateGoogleConnection } = await import("@brain-box-ai/integrations");
        const connectionStatus = await validateGoogleConnection(req.user.userId);
        log("GOOGLE_STATUS_CHECK", { userId: req.user.userId, status: connectionStatus.status });
        return res.json(connectionStatus);
    }
    catch (err) {
        res.status(500).json({
            connected: false,
            status: "REAUTH_REQUIRED",
            requiresReconnect: true,
            requiresApiEnablement: false,
            googleEmail: null,
            email: null,
            gmail: { enabled: false, scopeGranted: false, tokenRefreshable: false },
            gmailScopeGranted: false,
            hasRefreshToken: false,
            accessTokenValid: false,
            error: "Failed to check Google connection status.",
        });
    }
};
app.get("/api/integrations/google/gmail/status", authenticateToken, handleGoogleStatus);
app.get("/api/integrations/google/status", authenticateToken, handleGoogleStatus);
/**
 * GET /api/integrations/google/gmail/diagnostics & GET /api/integrations/google/diagnostics
 * Safe diagnostic endpoint checking environment, database, scope, and API enablement.
 */
const handleGoogleDiagnostics = async (req, res) => {
    try {
        const { validateGoogleConnection, validateOAuthConfiguration } = await import("@brain-box-ai/integrations");
        const config = validateOAuthConfiguration();
        const connectionStatus = await validateGoogleConnection(req.user.userId);
        return res.json({
            oauthClientConfigured: config.configured,
            redirectUriConfigured: !!config.redirectUri,
            gmailApiEnabled: connectionStatus.gmail?.available || false,
            calendarApiEnabled: connectionStatus.calendar?.available || false,
            googleAccountConnected: connectionStatus.connected,
            refreshTokenPresent: connectionStatus.hasRefreshToken,
            gmailScopeGranted: connectionStatus.gmailScopeGranted,
            tokenRefreshSuccessful: connectionStatus.accessTokenValid,
            status: connectionStatus.status,
            services: connectionStatus.services,
        });
    }
    catch (err) {
        return res.status(500).json({
            oauthClientConfigured: !!process.env.GOOGLE_CLIENT_ID,
            redirectUriConfigured: !!process.env.GOOGLE_REDIRECT_URI,
            gmailApiEnabled: false,
            calendarApiEnabled: false,
            googleAccountConnected: false,
            refreshTokenPresent: false,
            gmailScopeGranted: false,
            tokenRefreshSuccessful: false,
            status: "REAUTH_REQUIRED",
            error: err.message,
        });
    }
};
app.get("/api/integrations/google/gmail/diagnostics", authenticateToken, handleGoogleDiagnostics);
app.get("/api/integrations/google/diagnostics", authenticateToken, handleGoogleDiagnostics);
/**
 * POST /api/integrations/google/gmail/test-send & POST /api/integrations/google/test-send
 * Uses the EXACT SAME production Gmail execution path as AI tools.
 */
const handleTestSend = async (req, res) => {
    const { to, subject, body } = req.body;
    const userId = req.user.userId;
    log("GOOGLE_DIAGNOSTIC_TEST_SEND", { userId, to });
    try {
        const { GmailProvider } = await import("@brain-box-ai/integrations");
        const mail = new GmailProvider(userId);
        const recipient = to || req.user.email;
        const result = await mail.send(recipient, subject || "Brain Box Gmail Test", body || "This is a test email from Brain Box AI.");
        if (result.success || result.status === "sent") {
            return res.json({
                success: true,
                messageId: result.messageId,
                to: result.to,
                subject: result.subject,
            });
        }
        else {
            const errCode = result.errorCode || result.code || "GOOGLE_ERROR";
            const errMsg = result.message || result.error?.message || "Google service request failed.";
            return res.status(400).json({
                success: false,
                code: errCode,
                errorCode: errCode,
                message: errMsg,
            });
        }
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            code: "TEMPORARY_ERROR",
            errorCode: "TEMPORARY_ERROR",
            message: err.message || "Failed to execute test email send.",
        });
    }
};
app.post("/api/integrations/google/gmail/test-send", authenticateToken, handleTestSend);
app.post("/api/integrations/google/test-send", authenticateToken, handleTestSend);
/**
 * POST /api/integrations/google/disconnect
 * Revokes Google authorization and deletes the stored credential.
 */
app.post("/api/integrations/google/disconnect", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const workspaceId = req.user.workspaceId;
    try {
        const { data: credential } = await database_1.supabaseAdmin
            .from("Credential")
            .select("id, encryptedData")
            .eq("workspaceId", workspaceId)
            .eq("type", "google")
            .maybeSingle();
        if (credential) {
            // Attempt to revoke the token at Google — best-effort
            try {
                const tokenData = JSON.parse((0, auth_1.decryptCredential)(credential.encryptedData));
                const oauth2Client = (0, integrations_1.getGoogleOAuth2Client)();
                if (tokenData.access_token) {
                    await oauth2Client.revokeToken(tokenData.access_token);
                }
            }
            catch {
                // Non-critical — revocation failure shouldn't block disconnect
            }
            await database_1.supabaseAdmin.from("Credential").delete().eq("id", credential.id);
        }
        log("INTEGRATION_DISCONNECTED", { userId, service: "google" });
        res.json({ status: "success" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to disconnect Gmail." });
    }
});
// Legacy DELETE route — keep for backward compatibility with existing frontend
app.delete("/api/integrations/google", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const workspaceId = req.user.workspaceId;
    try {
        const { data: credential } = await database_1.supabaseAdmin
            .from("Credential")
            .select("id, encryptedData")
            .eq("workspaceId", workspaceId)
            .eq("type", "google")
            .maybeSingle();
        if (credential) {
            try {
                const tokenData = JSON.parse((0, auth_1.decryptCredential)(credential.encryptedData));
                const oauth2Client = (0, integrations_1.getGoogleOAuth2Client)();
                if (tokenData.access_token) {
                    await oauth2Client.revokeToken(tokenData.access_token);
                }
            }
            catch { }
            await database_1.supabaseAdmin.from("Credential").delete().eq("id", credential.id);
        }
        log("INTEGRATION_DISCONNECTED", { userId, service: "google" });
        res.json({ status: "success" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to disconnect integration." });
    }
});
// ============================================================
// 10. WEBHOOKS
// ============================================================
app.post("/api/webhooks/:workflowId", async (req, res) => {
    const { workflowId } = req.params;
    const signature = req.headers["x-signature"];
    try {
        const { data: workflow, error: fetchError } = await database_1.supabaseAdmin
            .from("Workflow")
            .select("*, versions:WorkflowVersion(*)")
            .eq("id", workflowId)
            .limit(1)
            .maybeSingle();
        if (fetchError || !workflow)
            return res.status(404).json({ error: "Workflow not found." });
        if (workflow.versions) {
            workflow.versions.sort((a, b) => b.version - a.version);
        }
        if (!workflow.versions || workflow.versions.length === 0 || workflow.status !== "ACTIVE") {
            return res.status(404).json({ error: "Active workflow not found." });
        }
        const nodes = workflow.versions[0].nodes;
        const webhookNode = nodes.find((n) => n.type === "trigger.webhook");
        if (!webhookNode) {
            return res.status(400).json({ error: "Workflow does not have a Webhook Trigger." });
        }
        const secret = webhookNode.data?.secret;
        if (secret) {
            const rawPayload = JSON.stringify(req.body);
            const isValid = (0, integrations_1.verifyWebhookSignature)(rawPayload, signature, secret);
            if (!isValid) {
                return res.status(401).json({ error: "Invalid webhook signature." });
            }
        }
        const { data: execution, error: execError } = await database_1.supabaseAdmin
            .from("Execution")
            .insert({
            workflowId: workflow.id,
            status: "RUNNING",
            triggerType: "webhook",
            triggerData: req.body,
            startedAt: new Date().toISOString(),
        })
            .select()
            .single();
        if (execError)
            throw execError;
        await worker_1.WorkerQueue.getInstance().addJob({
            type: "workflow.execute",
            workspaceId: workflow.workspaceId,
            executionId: execution.id,
            workflowId: workflow.id,
            triggerNodeId: webhookNode.id,
            triggerData: req.body,
        });
        res.json({ executionId: execution.id, status: "RUNNING" });
    }
    catch (err) {
        res.status(500).json({ error: "Webhook processing failed." });
    }
});
// ============================================================
// 11. AI WORKFLOW COPILOT
// ============================================================
app.post("/api/ai/generate-workflow", authenticateToken, async (req, res) => {
    const { input } = req.body;
    if (!input)
        return res.status(400).json({ error: "Prompt is required." });
    try {
        const provider = (0, ai_1.getLLMProvider)();
        const plan = await provider.generateWorkflow(input);
        res.json(plan);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to generate workflow." });
    }
});
// ============================================================
// 12. SETTINGS — Returns preferences AND workspaceId
// ============================================================
app.get("/api/settings", authenticateToken, async (req, res) => {
    try {
        const { data: pref, error } = await database_1.supabaseAdmin
            .from("UserPreference")
            .select("*")
            .eq("workspaceId", req.user.workspaceId)
            .limit(1)
            .maybeSingle();
        if (error)
            throw error;
        // CRITICAL: include workspaceId in response so frontend can store it
        res.json({
            ...(pref || {}),
            workspaceId: req.user.workspaceId,
        });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to load settings." });
    }
});
app.patch("/api/settings", authenticateToken, async (req, res) => {
    // Only allow safe preference fields — no arbitrary update
    const { theme, timezone, voiceInput, voiceAutoSend, voiceResponse } = req.body;
    const allowedUpdate = {};
    if (theme !== undefined)
        allowedUpdate.theme = theme;
    if (timezone !== undefined)
        allowedUpdate.timezone = timezone;
    if (voiceInput !== undefined)
        allowedUpdate.voiceInput = voiceInput;
    if (voiceAutoSend !== undefined)
        allowedUpdate.voiceAutoSend = voiceAutoSend;
    if (voiceResponse !== undefined)
        allowedUpdate.voiceResponse = voiceResponse;
    try {
        const { data: updated, error } = await database_1.supabaseAdmin
            .from("UserPreference")
            .update(allowedUpdate)
            .eq("workspaceId", req.user.workspaceId)
            .select()
            .single();
        if (error)
            throw error;
        res.json({ ...(updated || {}), workspaceId: req.user.workspaceId });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to save settings." });
    }
});
// ============================================================
// 13. HEALTH CHECK
// ============================================================
app.get("/api/health", async (req, res) => {
    let supabaseStatus = "checking";
    let aiStatus = "configured";
    let redisStatus = "disabled";
    let activepiecesStatus = process.env.ACTIVEPIECES_URL ? "configured" : "unconfigured";
    let googleOAuthStatus = process.env.GOOGLE_CLIENT_ID ? "configured" : "unconfigured";
    try {
        const { error } = await database_1.supabaseAdmin.from("User").select("count").limit(1);
        supabaseStatus = error ? "error" : "connected";
    }
    catch {
        supabaseStatus = "unreachable";
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!geminiKey && !openrouterKey) {
        aiStatus = "demo_mode";
    }
    const REDIS_URL = process.env.REDIS_URL;
    if (REDIS_URL && REDIS_URL.trim() !== "") {
        redisStatus = "configured";
    }
    const isHealthy = supabaseStatus === "connected";
    res.status(isHealthy ? 200 : 500).json({
        status: isHealthy ? "ok" : "degraded",
        services: {
            api: "ok",
            supabase: supabaseStatus,
            ai: aiStatus,
            activepieces: activepiecesStatus,
            googleOAuth: googleOAuthStatus,
            redis: redisStatus,
        },
        timestamp: new Date().toISOString(),
    });
});
// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
    log("UNHANDLED_ERROR", { error: err.message, path: req.path });
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
});
// ============================================================
// START SERVER
// ============================================================
(async () => {
    try {
        const { error } = await database_1.supabaseAdmin.from("User").select("count").limit(1);
        if (error) {
            console.warn("⚠️  Warning: Supabase connectivity check failed:", error.message);
        }
        else {
            console.log("✅ Supabase connected successfully.");
        }
    }
    catch (e) {
        console.warn("⚠️  Warning: Supabase startup check failed:", e.message);
    }
    // --- Google OAuth Startup Diagnostics & Validation ---
    const gConfig = (0, integrations_1.validateOAuthConfiguration)();
    console.log(`[GOOGLE CONFIG]`);
    console.log(`client configured: ${gConfig.configured}`);
    console.log(`client id suffix: ${gConfig.clientIdSuffix}`);
    console.log(`redirect URI: ${gConfig.redirectUri}`);
    console.log(`project ID: ${gConfig.projectId}`);
    if (gConfig.configured) {
        const oauth2Client = (0, integrations_1.getGoogleOAuth2Client)();
        const generatedRedirectUri = oauth2Client._redirectUri || oauth2Client.redirectUri;
        if (gConfig.redirectUri !== generatedRedirectUri) {
            throw new Error(`[OAUTH CONFIG ERROR] Configured GOOGLE_REDIRECT_URI (${gConfig.redirectUri}) does not match generated client redirect URI (${generatedRedirectUri}).`);
        }
    }
    app.listen(PORT, () => {
        const primary = process.env.OPENROUTER_API_KEY ? `OpenRouter (${process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"})` : process.env.GEMINI_API_KEY ? "Gemini" : "None";
        const fallback = (process.env.OPENROUTER_API_KEY && process.env.GEMINI_API_KEY) ? "Gemini" : "None";
        console.log(`🚀 Brain Box API running at http://localhost:${PORT}`);
        console.log(`   [AI] Primary provider: ${primary}`);
        console.log(`   [AI] Fallback provider: ${fallback}`);
    });
})();
//# sourceMappingURL=index.js.map