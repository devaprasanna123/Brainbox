"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSummaryArgsSchema = exports.TelegramSendArgsSchema = exports.DiscordSendArgsSchema = exports.SlackSendArgsSchema = exports.GmailSendArgsSchema = exports.CalendarCreateArgsSchema = exports.RegisterSchema = exports.LoginSchema = exports.UserPreferenceSchema = exports.DEFAULT_TIMEZONE = void 0;
exports.formatTimezoneDisplay = formatTimezoneDisplay;
exports.getCurrentTimeInTimezone = getCurrentTimeInTimezone;
const zod_1 = require("zod");
exports.DEFAULT_TIMEZONE = "Asia/Kolkata";
// --- Validation Schemas ---
exports.UserPreferenceSchema = zod_1.z.object({
    theme: zod_1.z.enum(["system", "light", "dark"]).default("system"),
    timezone: zod_1.z.string().default(exports.DEFAULT_TIMEZONE),
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
// --- Timezone Utilities ---
function formatTimezoneDisplay(tz) {
    try {
        const format = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
        const parts = format.formatToParts(new Date());
        const offset = parts.find(p => p.type === "timeZoneName")?.value || "";
        return `${tz} (${offset})`;
    }
    catch (e) {
        return `${tz}`;
    }
}
function getCurrentTimeInTimezone(tz = exports.DEFAULT_TIMEZONE) {
    const date = new Date();
    const str = date.toLocaleString("en-US", { timeZone: tz });
    return new Date(str);
}
//# sourceMappingURL=index.js.map