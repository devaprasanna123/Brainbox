import { z } from "zod";
export type UserRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
export type MessageType = "TEXT" | "VOICE" | "IMAGE" | "FILE" | "TOOL_CALL" | "TOOL_RESULT" | "WORKFLOW" | "APPROVAL" | "SYSTEM" | "ERROR";
export type WorkflowStatus = "ACTIVE" | "PAUSED" | "DRAFT";
export type ExecutionStatus = "RUNNING" | "SUCCESS" | "FAILED" | "WAITING" | "CANCELLED";
export declare const UserPreferenceSchema: z.ZodObject<{
    theme: z.ZodDefault<z.ZodEnum<["system", "light", "dark"]>>;
    timezone: z.ZodDefault<z.ZodString>;
    voiceInput: z.ZodDefault<z.ZodBoolean>;
    voiceAutoSend: z.ZodDefault<z.ZodBoolean>;
    voiceResponse: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    theme: "system" | "light" | "dark";
    timezone: string;
    voiceInput: boolean;
    voiceAutoSend: boolean;
    voiceResponse: boolean;
}, {
    theme?: "system" | "light" | "dark" | undefined;
    timezone?: string | undefined;
    voiceInput?: boolean | undefined;
    voiceAutoSend?: boolean | undefined;
    voiceResponse?: boolean | undefined;
}>;
export type UserPreferenceInput = z.infer<typeof UserPreferenceSchema>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const RegisterSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name?: string | undefined;
}, {
    email: string;
    password: string;
    name?: string | undefined;
}>;
export interface WorkflowNode {
    id: string;
    type: string;
    label: string;
    data: Record<string, any>;
    position: {
        x: number;
        y: number;
    };
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
export declare const CalendarCreateArgsSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startTime: z.ZodString;
    durationMinutes: z.ZodDefault<z.ZodNumber>;
    timezone: z.ZodOptional<z.ZodString>;
    attendees: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    location: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    startTime: string;
    durationMinutes: number;
    timezone?: string | undefined;
    description?: string | undefined;
    attendees?: string[] | undefined;
    location?: string | undefined;
}, {
    title: string;
    startTime: string;
    timezone?: string | undefined;
    description?: string | undefined;
    durationMinutes?: number | undefined;
    attendees?: string[] | undefined;
    location?: string | undefined;
}>;
export declare const GmailSendArgsSchema: z.ZodObject<{
    to: z.ZodString;
    subject: z.ZodString;
    body: z.ZodString;
}, "strip", z.ZodTypeAny, {
    to: string;
    subject: string;
    body: string;
}, {
    to: string;
    subject: string;
    body: string;
}>;
export declare const SlackSendArgsSchema: z.ZodObject<{
    channel: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    channel: string;
}, {
    message: string;
    channel: string;
}>;
export declare const DiscordSendArgsSchema: z.ZodObject<{
    webhookUrl: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    webhookUrl?: string | undefined;
}, {
    message: string;
    webhookUrl?: string | undefined;
}>;
export declare const TelegramSendArgsSchema: z.ZodObject<{
    chatId: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    chatId?: string | undefined;
}, {
    message: string;
    chatId?: string | undefined;
}>;
export declare const AiSummaryArgsSchema: z.ZodObject<{
    text: z.ZodString;
    prompt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    prompt?: string | undefined;
}, {
    text: string;
    prompt?: string | undefined;
}>;
export declare function isPrivateIp(ip: string): boolean;
export declare function validateUrlForSsrf(urlStr: string): Promise<boolean>;
