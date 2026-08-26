import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "your-anon-key";

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
    const payloadStr = typeof window !== "undefined"
      ? atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
      : Buffer.from(parts[1], "base64").toString("utf8");
    const payload = JSON.parse(payloadStr);
    if (payload.ref !== urlRef) {
      throw new Error("Project ref mismatch");
    }
  } catch (err) {
    throw new Error("Supabase client configuration is invalid.");
  }
}

validateSupabaseConfig(supabaseUrl, supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
