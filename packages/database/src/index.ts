import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Ensure environment variables are loaded
if (!process.env.SUPABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "your-service-role-key";

function validateSupabaseConfig(url: string, key: string) {
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
  } catch (err) {
    throw new Error("Supabase client configuration is invalid.");
  }
}

validateSupabaseConfig(supabaseUrl, supabaseAnonKey);

export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export function createServerClient(token?: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Client-side/Browser client
export const supabaseClient = createBrowserClient();

// Server-side/Admin client with service role key to bypass RLS for background workers & services
export const supabaseAdmin = createAdminClient();

export type SupabaseClientType = typeof supabaseClient;
export type SupabaseAdminType = typeof supabaseAdmin;
