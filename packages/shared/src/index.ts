import { z } from "zod";

// --- Enums ---
export type UserRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
export type MessageType =
  | "TEXT"
  | "VOICE"
  | "IMAGE"
  | "FILE"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "WORKFLOW"
  | "APPROVAL"
  | "SYSTEM"
  | "ERROR";

export type WorkflowStatus = "ACTIVE" | "PAUSED" | "DRAFT";
export type ExecutionStatus = "RUNNING" | "SUCCESS" | "FAILED" | "WAITING" | "CANCELLED";

// --- Validation Schemas ---
export const UserPreferenceSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).default("system"),
  timezone: z.string().default("UTC"),
  voiceInput: z.boolean().default(true),
  voiceAutoSend: z.boolean().default(false),
  voiceResponse: z.boolean().default(false),
});

export type UserPreferenceInput = z.infer<typeof UserPreferenceSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

// --- Workflow & Node Types ---
export interface WorkflowNode {
  id: string;
  type: string; // e.g., 'trigger.schedule', 'action.gmail.send', 'logic.condition'
  label: string;
  data: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowPlan {
  title: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// --- Integrations & Tool schemas ---
export const CalendarCreateArgsSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  startTime: z.string(), // ISO string
  durationMinutes: z.number().default(30),
  timezone: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  location: z.string().optional(),
});

export const GmailSendArgsSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

export const SlackSendArgsSchema = z.object({
  channel: z.string(),
  message: z.string(),
});

export const DiscordSendArgsSchema = z.object({
  webhookUrl: z.string().optional(), // or system-level configuration
  message: z.string(),
});

export const TelegramSendArgsSchema = z.object({
  chatId: z.string().optional(), // or dynamic
  message: z.string(),
});

export const AiSummaryArgsSchema = z.object({
  text: z.string(),
  prompt: z.string().optional(), // custom summary instructions
});

// --- SSRF Protection Utilities ---
import dns from "dns";

export function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "localhost") return true;
  
  const parts = ip.split(".");
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first === 10) return true;
    if (first === 172 && (second >= 16 && second <= 31)) return true;
    if (first === 192 && second === 168) return true;
    if (first === 169 && second === 254) return true; // Link-local
  }
  
  if (ip === "::1" || ip === "::" || ip.startsWith("fe80:") || ip.startsWith("fc00:") || ip.startsWith("fd00:")) {
    return true;
  }
  
  return false;
}

export async function validateUrlForSsrf(urlStr: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(urlStr);
    const hostname = parsedUrl.hostname;
    
    if (isPrivateIp(hostname)) return false;
    
    return new Promise((resolve) => {
      dns.lookup(hostname, (err, address) => {
        if (err) {
          resolve(false);
        } else {
          resolve(!isPrivateIp(address));
        }
      });
    });
  } catch {
    return false;
  }
}

