"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSummaryArgsSchema = exports.TelegramSendArgsSchema = exports.DiscordSendArgsSchema = exports.SlackSendArgsSchema = exports.GmailSendArgsSchema = exports.CalendarCreateArgsSchema = exports.RegisterSchema = exports.LoginSchema = exports.UserPreferenceSchema = void 0;
exports.isPrivateIp = isPrivateIp;
exports.validateUrlForSsrf = validateUrlForSsrf;
const zod_1 = require("zod");
// --- Validation Schemas ---
exports.UserPreferenceSchema = zod_1.z.object({
    theme: zod_1.z.enum(["system", "light", "dark"]).default("system"),
    timezone: zod_1.z.string().default("UTC"),
    voiceInput: zod_1.z.boolean().default(true),
    voiceAutoSend: zod_1.z.boolean().default(false),
    voiceResponse: zod_1.z.boolean().default(false),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().optional(),
});
// --- Integrations & Tool schemas ---
exports.CalendarCreateArgsSchema = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    startTime: zod_1.z.string(), // ISO string
    durationMinutes: zod_1.z.number().default(30),
    timezone: zod_1.z.string().optional(),
    attendees: zod_1.z.array(zod_1.z.string().email()).optional(),
    location: zod_1.z.string().optional(),
});
exports.GmailSendArgsSchema = zod_1.z.object({
    to: zod_1.z.string(),
    subject: zod_1.z.string(),
    body: zod_1.z.string(),
});
exports.SlackSendArgsSchema = zod_1.z.object({
    channel: zod_1.z.string(),
    message: zod_1.z.string(),
});
exports.DiscordSendArgsSchema = zod_1.z.object({
    webhookUrl: zod_1.z.string().optional(), // or system-level configuration
    message: zod_1.z.string(),
});
exports.TelegramSendArgsSchema = zod_1.z.object({
    chatId: zod_1.z.string().optional(), // or dynamic
    message: zod_1.z.string(),
});
exports.AiSummaryArgsSchema = zod_1.z.object({
    text: zod_1.z.string(),
    prompt: zod_1.z.string().optional(), // custom summary instructions
});
// --- SSRF Protection Utilities ---
const dns_1 = __importDefault(require("dns"));
function isPrivateIp(ip) {
    if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "localhost")
        return true;
    const parts = ip.split(".");
    if (parts.length === 4) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first === 10)
            return true;
        if (first === 172 && (second >= 16 && second <= 31))
            return true;
        if (first === 192 && second === 168)
            return true;
        if (first === 169 && second === 254)
            return true; // Link-local
    }
    if (ip === "::1" || ip === "::" || ip.startsWith("fe80:") || ip.startsWith("fc00:") || ip.startsWith("fd00:")) {
        return true;
    }
    return false;
}
async function validateUrlForSsrf(urlStr) {
    try {
        const parsedUrl = new URL(urlStr);
        const hostname = parsedUrl.hostname;
        if (isPrivateIp(hostname))
            return false;
        return new Promise((resolve) => {
            dns_1.default.lookup(hostname, (err, address) => {
                if (err) {
                    resolve(false);
                }
                else {
                    resolve(!isPrivateIp(address));
                }
            });
        });
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=index.js.map