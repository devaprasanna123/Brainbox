import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error(`[OAUTH_CALLBACK_ERROR] ${error}: ${errorDescription}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (code) {
    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error("[OAUTH_EXCHANGE_ERROR]", exchangeError.message);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(exchangeError.message)}`);
      }

      if (data.session && data.user) {
        // Ensure user profile, workspace, and preferences are initialized via backend API or database
        try {
          const res = await fetch(`${API_URL}/api/settings`, {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (res.ok) {
            const settingsData = await res.json();
            if (settingsData.workspaceId) {
              // We are server-side in a route handler, cookies or client session handle local persistence
            }
          }
        } catch (initErr) {
          console.warn("[OAUTH_PROFILE_INIT_WARN]", initErr);
        }

        return NextResponse.redirect(`${origin}/chat`);
      }
    } catch (err: any) {
      console.error("[OAUTH_CALLBACK_EXCEPTION]", err.message);
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(err.message || "OAuth failed")}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_code_provided`);
}
