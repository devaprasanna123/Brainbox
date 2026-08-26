"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabaseClient = void 0;
exports.createBrowserClient = createBrowserClient;
exports.createServerClient = createServerClient;
exports.createAdminClient = createAdminClient;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Ensure environment variables are loaded
if (!process.env.SUPABASE_URL) {
    dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env") });
    dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../.env") });
    dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../../.env") });
}
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "your-service-role-key";
function validateSupabaseConfig(url, key) {
    if (!url || !key || url.includes("your-project") || key.includes("your-anon-key")) {
        throw new Error("Supabase client configuration is invalid.");
    }
    try {
        const parsedUrl = new URL(url);
        const hostParts = parsedUrl.hostname.split(".");
        const urlRef = hostParts[0];
        const parts = key.split(".");
        if (parts.length !== 3) {
            throw new Error("Invalid JWT format");
        }
        const payloadStr = Buffer.from(parts[1], "base64").toString("utf8");
        const payload = JSON.parse(payloadStr);
        if (payload.ref !== urlRef) {
            throw new Error("Project ref mismatch");
        }
    }
    catch (err) {
        throw new Error("Supabase client configuration is invalid.");
    }
}
validateSupabaseConfig(supabaseUrl, supabaseAnonKey);
function createBrowserClient() {
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
}
function createServerClient(token) {
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
        global: {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
    });
}
function createAdminClient() {
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}
// Client-side/Browser client
exports.supabaseClient = createBrowserClient();
// Server-side/Admin client with service role key to bypass RLS for background workers & services
exports.supabaseAdmin = createAdminClient();
//# sourceMappingURL=index.js.map