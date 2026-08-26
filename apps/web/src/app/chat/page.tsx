"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Search,
  Plus,
  Send,
  Mic,
  MicOff,
  Settings,
  LogOut,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Play,
  Check,
  Trash2,
  ChevronRight,
  Workflow,
  Cpu,
  AlertTriangle,
  Loader2,
  Database,
  X,
  Calendar,
  Mail,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { auth, onAuthStateChanged, firebaseSignOut } from "@/lib/firebase";

// ============================================================
// Types
// ============================================================
interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  type: string;
  content: string;
  metadata?: any;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

interface Approval {
  id: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  actionType: string;
  details: any;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface MemoryRecord {
  id: string;
  type: string;
  key: string;
  value: string;
  importance: number;
  updatedAt: string;
}

// ============================================================
// Wake Phrase Detection (mirrors server-side logic)
// ============================================================
function isWakePhrase(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(hey brain|hello brain|hi brain|hey brain box|hello brain box)[!.?]?$/.test(normalized);
}

// ============================================================
// Main Chat Page
// ============================================================
export default function ChatPage() {
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryRecord | null>(null);
  const [editValue, setEditValue] = useState("");

  const [sessionRestored, setSessionRestored] = useState(false);
  const [wakePhraseActive, setWakePhraseActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // ----------------------------------------------------------
  // Auth helpers
  // ----------------------------------------------------------
  const getToken = (): string => localStorage.getItem("token") || "";

  const getHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  });

  /**
   * Refresh Firebase ID Token and update stored token.
   * Called when a 401 is received from the API.
   */
  const refreshSession = useCallback(async (): Promise<string | null> => {
    if (auth.currentUser) {
      try {
        const newToken = await auth.currentUser.getIdToken(true);
        localStorage.setItem("token", newToken);
        return newToken;
      } catch {}
    }
    return null;
  }, []);

  /**
   * Authenticated fetch with automatic 401 → refresh → retry.
   */
  const authFetch = useCallback(
    async (url: string, opts: RequestInit = {}): Promise<Response> => {
      const res = await fetch(url, {
        ...opts,
        headers: { ...getHeaders(), ...(opts.headers as Record<string, string> || {}) },
      });

      if (res.status === 401) {
        const newToken = await refreshSession();
        if (newToken) {
          return fetch(url, {
            ...opts,
            headers: {
              ...opts.headers,
              "Content-Type": "application/json",
              Authorization: `Bearer ${newToken}`,
            },
          });
        } else {
          router.push("/login");
        }
      }
      return res;
    },
    [refreshSession, router]
  );

  // ----------------------------------------------------------
  // Session restore on mount
  // ----------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user && !localStorage.getItem("token")) {
        router.push("/login");
        return;
      }

      if (user) {
        const token = await user.getIdToken();
        localStorage.setItem("token", token);
        localStorage.setItem(
          "user",
          JSON.stringify({ id: user.uid, email: user.email, name: user.displayName || user.email?.split("@")[0] || "User" })
        );

        if (!localStorage.getItem("workspaceId")) {
          try {
            const res = await fetch(`${API_URL}/api/settings`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              const wsId = data.data?.workspaceId || data.workspaceId;
              if (wsId) localStorage.setItem("workspaceId", wsId);
            }
          } catch {}
        }
      }

      setSessionRestored(true);
      fetchConversations();
      fetchApprovals();
      fetchMemories();
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/conversations`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setConversations(list);
        if (list.length > 0 && !activeConv) {
          setActiveConv(list[0].id);
        }
      }
    } catch {}
  };

  const fetchMessages = async (id: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        const conv = data.data || data;
        setMessages(conv.messages || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (activeConv) {
      fetchMessages(activeConv);
    }
  }, [activeConv]);

  const fetchApprovals = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/approvals`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.data || [];
        setApprovals(items.filter((a: any) => a.status === "PENDING"));
      }
    } catch {}
  };

  const fetchMemories = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/memory`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.data || [];
        setMemories(items);
      }
    } catch {}
  };

  // ----------------------------------------------------------
  // Conversation actions
  // ----------------------------------------------------------
  const handleCreateConversation = async (): Promise<string | null> => {
    try {
      const res = await authFetch(`${API_URL}/api/conversations`, {
        method: "POST",
        body: JSON.stringify({ title: "New Conversation" }),
      });
      if (res.ok) {
        const responseData = await res.json();
        const created = responseData.data || responseData;
        setConversations((prev) => [created, ...prev]);
        setActiveConv(created.id);
        setMessages([]);
        return created.id;
      }
    } catch {}
    return null;
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`${API_URL}/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConv === id) {
          setActiveConv(null);
          setMessages([]);
        }
      }
    } catch {}
  };

  // ----------------------------------------------------------
  // Send Message (core flow)
  // ----------------------------------------------------------
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setInputMessage("");
    setVoiceText("");
    lastUserMessageRef.current = text;

    // --- Wake Phrase Detection (client-side) ---
    if (isWakePhrase(text)) {
      setWakePhraseActive(true);
      setIsThinking(false);
      if (activeConv) {
        setIsThinking(true);
        try {
          const res = await authFetch(`${API_URL}/api/chat`, {
            method: "POST",
            body: JSON.stringify({ conversationId: activeConv, content: text, useSSE: false }),
          });
          if (res.ok) {
            fetchMessages(activeConv);
          }
        } catch {} finally {
          setIsThinking(false);
          isSubmittingRef.current = false;
        }
      } else {
        const wakeMsg: Message = {
          id: Math.random().toString(),
          role: "ASSISTANT",
          type: "TEXT",
          content: "Hey! I'm Brain Box AI — your personal automation assistant. What would you like me to do?",
          createdAt: new Date().toISOString(),
        };
        setMessages([wakeMsg]);
        isSubmittingRef.current = false;
      }
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    // Abort previous pending request if active
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    setIsThinking(true);

    // Auto-create conversation if none selected
    let currentConvId = activeConv;
    if (!currentConvId) {
      currentConvId = await handleCreateConversation();
      if (!currentConvId) {
        setIsThinking(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            role: "SYSTEM",
            type: "ERROR",
            content: "Unable to create a new conversation. Please try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
        clearTimeout(timeoutId);
        return;
      }
    }

    // Optimistic user message
    const userMsg: Message = {
      id: Math.random().toString(),
      role: "USER",
      type: "TEXT",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const clientRequestId = "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      const response = await authFetch(`${API_URL}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: currentConvId,
          content: text,
          useSSE: true,
          clientRequestId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Server error" }));
        const errMsg = typeof errData.error === "object" ? errData.error.message : errData.error;
        throw new Error(errMsg || "Server error");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const assistantMsgId = Math.random().toString();

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "ASSISTANT",
          type: "TEXT",
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);

      let buffer = "";
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6).trim();
          if (!dataStr) continue;

          try {
            const event = JSON.parse(dataStr);
            if (event.type === "message:delta") {
              assistantContent += event.content || "";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                )
              );
            } else if (event.type === "message:error") {
              throw new Error(event.error || "AI service encountered an error.");
            } else if (event.type === "message:complete") {
              if (event.message) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? event.message : m))
                );
              }
              setIsThinking(false);
              fetchMessages(currentConvId);
              fetchConversations();
              fetchApprovals();
              fetchMemories();
            }
          } catch (jsonErr: any) {
            if (jsonErr.message && !jsonErr.message.includes("JSON")) {
              throw jsonErr;
            }
          }
        }
      }

      if (buffer.trim().startsWith("data: ")) {
        const dataStr = buffer.trim().slice(6).trim();
        try {
          const event = JSON.parse(dataStr);
          if (event.type === "message:complete" && event.message) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? event.message : m))
            );
            fetchMessages(currentConvId);
          }
        } catch {}
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[CHAT_ABORTED] Request aborted.");
        return;
      }
      const isNetworkOffline = err instanceof TypeError || err.message === "Failed to fetch" || err.message === "NetworkError when attempting to fetch resource.";
      const isTimeout = err.name === "AbortError" || (err.message || "").toLowerCase().includes("timeout");

      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: "SYSTEM",
          type: "ERROR",
          content: isTimeout
            ? "The AI service took too long to respond (timeout). Please try again."
            : isNetworkOffline
            ? "Brain Box AI cannot reach the server right now. Please check your connection and try again."
            : err.message || "We couldn't send your message. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setIsThinking(false);
      isSubmittingRef.current = false;
      voiceStateRef.current = "IDLE";
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
    }
  };

  // Voice State Machine Refs & Preferences
  const voiceStateRef = useRef<"IDLE" | "RECORDING" | "TRANSCRIBING" | "READY_TO_SUBMIT" | "SUBMITTING" | "DONE" | "ERROR">("IDLE");
  const transcriptBufferRef = useRef<string>("");
  const isSubmittingRef = useRef<boolean>(false);
  const voiceAutoSendRef = useRef<boolean>(false);

  useEffect(() => {
    fetchUserSettings();
  }, []);

  const fetchUserSettings = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        const autoSend = !!(data.data?.voiceAutoSend ?? data.voiceAutoSend);
        voiceAutoSendRef.current = autoSend;
      }
    } catch {}
  };

  // ----------------------------------------------------------
  // Voice Recording (Web Speech API State Machine)
  // ----------------------------------------------------------
  const startRecording = () => {
    if (isSubmittingRef.current || voiceStateRef.current === "RECORDING" || voiceStateRef.current === "TRANSCRIBING" || voiceStateRef.current === "SUBMITTING") {
      console.log("[VOICE] Recording or submission already in progress.");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    voiceStateRef.current = "RECORDING";
    setIsRecording(true);
    setVoiceText("");
    transcriptBufferRef.current = "";

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const text = (final || interim).trim();
      transcriptBufferRef.current = text;
      setVoiceText(text);
      setInputMessage(text);
    };

    rec.onerror = (event: any) => {
      console.warn("[VOICE RECOGNITION ERROR]", event.error);
      if (event.error === "not-allowed") {
        alert("Microphone permission was denied. Please allow microphone access in browser settings.");
      }
      stopRecording(false);
    };

    rec.onend = () => {
      setIsRecording(false);
      if (voiceStateRef.current === "RECORDING") {
        voiceStateRef.current = "TRANSCRIBING";
        const finalTranscript = transcriptBufferRef.current.trim();

        if (!finalTranscript) {
          voiceStateRef.current = "IDLE";
          return;
        }

        if (voiceAutoSendRef.current) {
          if (finalTranscript === lastUserMessageRef.current || isSubmittingRef.current) {
            console.log("[VOICE] Duplicate transcript submission prevented:", finalTranscript);
            voiceStateRef.current = "IDLE";
            return;
          }
          voiceStateRef.current = "SUBMITTING";
          handleSendMessage(finalTranscript);
        } else {
          voiceStateRef.current = "READY_TO_SUBMIT";
        }
      }
    };

    rec.start();
    recognitionRef.current = rec;
  };

  const stopRecording = (shouldSubmit: boolean = true) => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsRecording(false);

    if (!shouldSubmit) {
      voiceStateRef.current = "IDLE";
      transcriptBufferRef.current = "";
      setVoiceText("");
      setInputMessage("");
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording(true);
    else startRecording();
  };

  // ----------------------------------------------------------
  // Approvals
  // ----------------------------------------------------------
  const handleApprove = async (approvalId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/approvals/${approvalId}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
        if (activeConv) fetchMessages(activeConv);
      }
    } catch {}
  };

  const handleReject = async (approvalId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/approvals/${approvalId}/reject`, {
        method: "POST",
      });
      if (res.ok) {
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
        if (activeConv) fetchMessages(activeConv);
      }
    } catch {}
  };

  // ----------------------------------------------------------
  // Memory Management
  // ----------------------------------------------------------
  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/memory/${id}`, { method: "DELETE" });
      if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {}
  };

  const handleClearAllMemory = async () => {
    if (!confirm("Clear all Brain Box memories? This cannot be undone.")) return;
    try {
      const res = await authFetch(`${API_URL}/api/memory/all`, { method: "DELETE" });
      if (res.ok) setMemories([]);
    } catch {}
  };

  const handleSaveEditedMemory = async () => {
    if (!editingMemory) return;
    try {
      const res = await authFetch(`${API_URL}/api/memory/${editingMemory.id}`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValue }),
      });
      if (res.ok) {
        setMemories((prev) =>
          prev.map((m) => (m.id === editingMemory.id ? { ...m, value: editValue } : m))
        );
        setEditingMemory(null);
        setEditValue("");
      }
    } catch {}
  };

  // ----------------------------------------------------------
  // Logout
  // ----------------------------------------------------------
  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    localStorage.clear();
    router.push("/login");
  };

  // ----------------------------------------------------------
  // Filtered conversations for sidebar search
  // ----------------------------------------------------------
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ----------------------------------------------------------
  // Loading state
  // ----------------------------------------------------------
  if (!sessionRestored) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-2 font-medium">Restoring session...</span>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ============ SIDEBAR ============ */}
      <aside className="w-80 border-r border-slate-900 bg-slate-900/40 flex flex-col h-full flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-900 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-indigo-400">
            <Brain className="w-5 h-5 text-indigo-500" />
            <span>Brain Box AI</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleCreateConversation}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm text-white shadow-lg shadow-indigo-600/10 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 mb-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-900 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-xs">No conversations yet</div>
          ) : (
            filteredConversations.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setActiveConv(c.id);
                  setMessages([]);
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition text-xs ${
                  activeConv === c.id
                    ? "bg-slate-900 text-indigo-400 font-semibold border-l-2 border-indigo-500"
                    : "text-slate-400 hover:bg-slate-900/60 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{c.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Bottom Links */}
        <div className="p-3 border-t border-slate-900 space-y-2">
          {/* Brain Memory Panel Toggle */}
          <button
            onClick={() => setShowMemoryPanel(!showMemoryPanel)}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-900 transition text-xs font-semibold text-indigo-400"
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-500" />
              <span>Brain Memory</span>
              {memories.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[9px] font-bold">
                  {memories.length}
                </span>
              )}
            </div>
            <ChevronRight
              className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showMemoryPanel ? "rotate-90" : ""}`}
            />
          </button>

          {/* Workflow Builder */}
          <Link
            href="/workflows"
            className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-900 transition text-xs font-semibold text-indigo-400"
          >
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-indigo-500" />
              <span>Workflow Builder</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </Link>
        </div>
      </aside>

      {/* ============ MEMORY PANEL (Overlay or side panel) ============ */}
      {showMemoryPanel && (
        <div className="w-72 border-r border-slate-900 bg-slate-900/60 flex flex-col h-full flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-900 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              Brain Memory
            </h3>
            <div className="flex items-center gap-2">
              {memories.length > 0 && (
                <button
                  onClick={handleClearAllMemory}
                  className="text-[10px] text-red-400 hover:text-red-300 font-semibold uppercase tracking-wide"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setShowMemoryPanel(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {memories.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-xs">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No memories yet.</p>
                <p className="mt-1">Tell Brain Box something to remember!</p>
              </div>
            ) : (
              memories.map((m) => (
                <div
                  key={m.id}
                  className="group bg-slate-950 border border-slate-800 rounded-lg p-3"
                >
                  {editingMemory?.id === m.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full text-xs bg-slate-900 border border-indigo-500 text-white rounded p-2 resize-none focus:outline-none"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEditedMemory}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingMemory(null)}
                          className="text-xs text-slate-500 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-slate-300 leading-relaxed flex-1">{m.value}</p>
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => {
                              setEditingMemory(m);
                              setEditValue(m.value);
                            }}
                            className="p-1 text-slate-500 hover:text-indigo-400"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteMemory(m.id)}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] uppercase font-bold text-indigo-500 bg-indigo-950/40 px-1.5 py-0.5 rounded">
                          {m.type}
                        </span>
                        <span className="text-[9px] text-slate-600">
                          {new Date(m.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ============ MAIN CHAT AREA ============ */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative min-w-0">
        {/* Chat Header */}
        <header className="px-6 py-4 border-b border-slate-900 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {wakePhraseActive && (
              <span className="flex items-center gap-1.5 text-indigo-400 text-sm font-semibold animate-pulse">
                <Sparkles className="w-4 h-4" />
                Brain Box is listening...
              </span>
            )}
            {!wakePhraseActive && (
              <span className="font-semibold text-sm truncate max-w-xs">
                {conversations.find((c) => c.id === activeConv)?.title || "Select or start a chat"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {wakePhraseActive && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950/40 border border-indigo-500/20 text-indigo-400 rounded-full text-[10px] font-semibold uppercase tracking-wider animate-pulse">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Brain Mode: ACTIVE</span>
              </div>
            )}
          </div>
        </header>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-indigo-600/10 border border-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                <Brain className="w-10 h-10 text-indigo-400 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Welcome to Brain Box AI</h2>
              <p className="text-sm text-slate-400 mb-6">
                What would you like to automate? Ask me to schedule events, search your Gmail,
                or simply say{" "}
                <span className="text-indigo-400 font-semibold">"Hey Brain"</span> to activate.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full text-left">
                <button
                  onClick={() =>
                    handleSendMessage(
                      "Tomorrow at 10 AM remind me to submit the hackathon project and send an email to Arun Kumar saying the deadline is tomorrow."
                    )
                  }
                  className="p-3 bg-slate-900 hover:bg-slate-900/60 border border-slate-800 rounded-xl text-xs hover:border-slate-700 transition text-left"
                >
                  📅 "Tomorrow at 10 AM remind me to submit my project..."
                </button>
                <button
                  onClick={() =>
                    handleSendMessage(
                      "Remember that my project is called Brain Box AI and I'm building it with Next.js and Supabase."
                    )
                  }
                  className="p-3 bg-slate-900 hover:bg-slate-900/60 border border-slate-800 rounded-xl text-xs hover:border-slate-700 transition text-left"
                >
                  🧠 "Remember that my project is called Brain Box AI..."
                </button>
                <button
                  onClick={() =>
                    handleSendMessage(
                      "Every weekday at 8 AM check my important emails and send me a summary."
                    )
                  }
                  className="p-3 bg-slate-900 hover:bg-slate-900/60 border border-slate-800 rounded-xl text-xs hover:border-slate-700 transition text-left"
                >
                  📨 "Every weekday at 8 AM check my emails and summarize..."
                </button>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-4 ${m.role === "USER" ? "justify-end" : ""}`}
              >
                {m.role !== "USER" && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-sm flex-shrink-0">
                    🧠
                  </div>
                )}
                <div
                  className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${
                    m.role === "USER"
                      ? "bg-indigo-600 text-white rounded-br-none"
                      : m.type === "ERROR"
                      ? "bg-red-950/20 border border-red-500/20 text-slate-200 rounded-bl-none"
                      : "bg-slate-900/50 border border-slate-900 text-slate-200 rounded-bl-none"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>

                  {m.type === "ERROR" && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          if (lastUserMessageRef.current) {
                            handleSendMessage(lastUserMessageRef.current);
                          }
                        }}
                        className="px-3 py-1.5 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 rounded-lg text-xs font-semibold text-red-200 transition flex items-center gap-1.5"
                      >
                        <span>🔄 Retry Message</span>
                      </button>
                    </div>
                  )}

                  {/* Tool call results */}
                  {m.metadata?.toolCalls && m.metadata.toolCalls.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Executed Actions
                      </p>
                      {m.metadata.toolCalls.map((call: any, idx: number) => {
                        const result = m.metadata.toolResults?.[idx];
                        const isCal = call.tool.startsWith("calendar");
                        const isMail = call.tool.startsWith("gmail");
                        const isSuccess = result?.success === true || result?.status === "success" || result?.status === "sent";
                        const isFailed = result?.success === false || result?.status === "failed" || !!result?.error;

                        return (
                          <div
                            key={idx}
                            className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start justify-between gap-4"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`p-2 rounded-lg ${
                                  isCal
                                    ? "bg-emerald-950/50 text-emerald-400"
                                    : isMail
                                    ? "bg-blue-950/50 text-blue-400"
                                    : "bg-purple-950/50 text-purple-400"
                                }`}
                              >
                                {isCal ? (
                                  <Calendar className="w-4 h-4" />
                                ) : isMail ? (
                                  <Mail className="w-4 h-4" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-white uppercase tracking-wide">
                                  {call.tool.replace(".", " → ")}
                                </p>
                                <p className="text-xs text-slate-300 mt-1 font-medium">
                                  {isCal
                                    ? (result?.summary || call.arguments.title || "Calendar Event")
                                    : isMail
                                    ? `To: ${result?.to || call.arguments.to || ""}`
                                    : call.tool === "memory.save"
                                    ? `Saved: ${call.arguments.content?.slice(0, 50)}...`
                                    : JSON.stringify(call.arguments).slice(0, 60)}
                                </p>
                                {isCal && (call.arguments.startTime || result?.start) && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    🕒 {new Date(result?.start || call.arguments.startTime).toLocaleString()}
                                  </p>
                                )}
                                {result?.eventId && (
                                  <p className="text-[9px] text-emerald-400/90 font-mono mt-1">
                                    Event ID: {result.eventId}
                                  </p>
                                )}
                                {result?.htmlLink && (
                                  <a
                                    href={result.htmlLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline mt-1 font-medium"
                                  >
                                    <span>🔗 View in Google Calendar</span>
                                  </a>
                                )}
                                {result?.messageId && (
                                  <p className="text-[9px] text-indigo-400 font-mono mt-1">
                                    Message ID: {result.messageId}
                                  </p>
                                )}
                                {result?.threadId && (
                                  <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                                    Thread ID: {result.threadId}
                                  </p>
                                )}
                                {result?.info && (
                                  <p className="text-[9px] text-yellow-500/80 mt-1">
                                    {result.info}
                                  </p>
                                )}
                                {(result?.error?.message || result?.message) && isFailed && (
                                  <p className="text-[10px] text-red-400/90 mt-1 font-semibold">
                                    Reason: {result.error?.message || result.message}
                                  </p>
                                )}
                                {(result?.errorCode === "GOOGLE_API_DISABLED" || result?.error?.code === "GOOGLE_API_DISABLED" || result?.error?.code === "GMAIL_API_DISABLED") && (
                                  <div className="mt-2 p-2 bg-amber-950/30 border border-amber-500/20 rounded-lg text-[10px] text-amber-300">
                                    <span>⚠️ {call.tool.startsWith("calendar") ? "Google Calendar" : "Gmail"} API is disabled in Google Cloud Console. Enable it for project 412264053150.</span>
                                  </div>
                                )}
                                {(result?.error?.code === "GOOGLE_SCOPE_MISSING" ||
                                  result?.error?.code === "GOOGLE_NOT_CONNECTED" ||
                                  result?.error?.code === "GOOGLE_AUTH_EXPIRED" ||
                                  result?.error?.code === "GOOGLE_REAUTH_REQUIRED" ||
                                  result?.errorCode === "GOOGLE_REAUTH_REQUIRED" ||
                                  result?.code === "GOOGLE_REAUTH_REQUIRED" ||
                                  (m.content && m.content.includes("reconnected"))) && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await authFetch(`${API_URL}/api/integrations/google/connect`);
                                          const data = await res.json();
                                          if (res.ok && data.url) {
                                            window.location.href = data.url;
                                          } else {
                                            router.push("/settings");
                                          }
                                        } catch {
                                          router.push("/settings");
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow-md"
                                    >
                                      <span>🔗 Reconnect Google</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {(() => {
                              let statusText = "SUCCESS";
                              let statusClass = "text-green-400 bg-green-950/30 border-green-500/10";

                              if (isFailed) {
                                statusText = "FAILED";
                                statusClass = "text-red-400 bg-red-950/30 border-red-500/10";
                              } else if (result?.status === "simulated") {
                                statusText = "SIMULATED";
                                statusClass = "text-yellow-400 bg-yellow-950/30 border-yellow-500/10";
                              } else if (!result) {
                                statusText = call.tool === "gmail.send" ? "SENDING" : "RUNNING";
                                statusClass = "text-blue-400 bg-blue-950/30 border-blue-500/20";
                              } else if (isSuccess) {
                                statusText = call.tool === "gmail.send" ? "SENT" : "SUCCESS";
                              }

                              return (
                                <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${statusClass}`}>
                                  {(statusText === "SENT" || statusText === "SUCCESS") && <Check className="w-3 h-3" />}
                                  {statusText === "SIMULATED" && <Sparkles className="w-3 h-3 text-yellow-400" />}
                                  {statusText === "FAILED" && <X className="w-3 h-3 text-red-400" />}
                                  {(statusText === "SENDING" || statusText === "RUNNING") && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                                  <span>{statusText}</span>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Workflow creation card */}
                  {m.metadata?.toolCalls?.some((c: any) => c.tool === "workflow.create") && (
                    <div className="mt-4 p-4 border border-indigo-900/50 bg-indigo-950/20 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Workflow className="w-5 h-5 text-indigo-400 animate-pulse" />
                        <div>
                          <p className="text-xs font-bold text-white">✨ Automation Generated</p>
                          <p className="text-[10px] text-indigo-300 mt-0.5">
                            Ready to view & activate in builder.
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/workflows"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 transition rounded-lg text-xs font-bold text-white flex items-center gap-1"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Open builder</span>
                      </Link>
                    </div>
                  )}
                </div>
                {m.role === "USER" && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                    U
                  </div>
                )}
              </div>
            ))
          )}

          {/* Thinking indicator */}
          {isThinking && (
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-sm flex-shrink-0">
                🧠
              </div>
              <div className="bg-slate-900/50 border border-slate-900 text-slate-400 rounded-2xl rounded-bl-none p-4 text-xs font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                />
                <span>Brain Box is processing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Approval Banner */}
        {approvals.length > 0 && (
          <div className="mx-6 mb-4 p-4 border border-yellow-500/20 bg-yellow-950/20 rounded-2xl flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white">⚠️ Action Authorization Required</p>
                <p className="text-[10px] text-yellow-300 mt-1">
                  Brain Box requires permission to execute:{" "}
                  <span className="font-semibold text-white">{approvals[0].actionType}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleReject(approvals[0].id)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition"
              >
                Reject
              </button>
              <button
                onClick={() => handleApprove(approvals[0].id)}
                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-black rounded-lg text-[10px] font-bold transition"
              >
                Authorize Action
              </button>
            </div>
          </div>
        )}

        {/* Voice Recording Visualizer */}
        {isRecording && (
          <div className="px-6 py-2 bg-indigo-950/20 border-t border-indigo-900/30 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5 items-end h-5 w-12">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-indigo-500 rounded animate-pulse"
                    style={{ height: `${20 + Math.random() * 60}%`, animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Listening...
              </span>
            </div>
            <button
              onClick={() => stopRecording(true)}
              className="text-xs font-bold text-red-400 hover:text-red-300 uppercase tracking-wide"
            >
              Stop
            </button>
          </div>
        )}

        {/* Chat Composer */}
        <div className="p-6 border-t border-slate-900 bg-slate-950/40 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className={`flex items-center gap-3 bg-slate-900 border rounded-2xl p-2 transition ${
              wakePhraseActive
                ? "border-indigo-500 shadow-lg shadow-indigo-500/10"
                : "border-slate-800 focus-within:border-indigo-600"
            }`}
          >
            <button
              type="button"
              disabled={isThinking}
              onClick={toggleRecording}
              className={`p-3 rounded-xl transition ${
                isRecording
                  ? "bg-red-500 text-white animate-pulse"
                  : isThinking
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={
                isRecording
                  ? "Listening..."
                  : wakePhraseActive
                  ? "Brain Box is ready — what would you like to do?"
                  : 'Ask Brain Box anything... or say "Hey Brain"'
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isThinking}
              className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 disabled:text-indigo-900 disabled:cursor-not-allowed text-white rounded-xl font-bold transition shadow-lg shadow-indigo-600/10"
            >
              {isThinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          {voiceText && (
            <p className="text-[10px] text-slate-500 mt-2 ml-14">
              Transcript:{" "}
              <span className="text-slate-400">"{voiceText}"</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
