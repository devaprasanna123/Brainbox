"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { auth, googleProvider, signInWithPopup, isFirebaseConfigured } from "@/lib/firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configMissing, setConfigMissing] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setConfigMissing(true);
    }
  }, []);

  const getErrorMessage = (err: any): string => {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("popup-closed-by-user")) {
      return "Sign-in popup was closed before completing.";
    }
    if (msg.includes("popup-blocked")) {
      return "Sign-in popup was blocked by your browser. Please allow popups for this site.";
    }
    if (msg.includes("network") || msg.includes("failed to fetch")) {
      return "Cannot reach authentication server. Please check your network connection.";
    }
    return err?.message || "Authentication failed. Please try again.";
  };

  const persistSessionAndRedirect = async (idToken: string, userObj: { id: string; email: string; name: string }) => {
    localStorage.setItem("token", idToken);
    localStorage.setItem("user", JSON.stringify(userObj));

    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const settingsData = await res.json();
        const workspaceId = settingsData.data?.workspaceId || settingsData.workspaceId;
        if (workspaceId) {
          localStorage.setItem("workspaceId", workspaceId);
        }
      }
    } catch (err) {
      console.warn("[SESSION_PERSIST_SETTINGS_WARNING]", err);
    }

    router.push("/chat");
  };

  const handleGoogleLogin = async () => {
    if (!isFirebaseConfigured()) {
      setError("Firebase Authentication is not configured. Please set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variables.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const idToken = await user.getIdToken(true);

      await persistSessionAndRedirect(idToken, {
        id: user.uid,
        email: user.email || "",
        name: user.displayName || user.email?.split("@")[0] || "User",
      });
    } catch (err: any) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative">
      <div className="absolute top-0 right-0 border-l border-b border-indigo-500/20 bg-indigo-950/20 px-3 py-1 rounded-bl-xl flex items-center gap-1">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
        <span className="text-[10px] font-semibold text-indigo-300 uppercase">
          Think. Say. Automate.
        </span>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center mb-4">
          <Brain className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Access your Brain Box</h2>
        <p className="text-slate-400 text-sm mt-1 text-center">
          Sign in with your Google account to connect your personalized AI assistant
        </p>
      </div>

      {configMissing && (
        <div className="mb-6 p-4 bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs rounded-xl space-y-1">
          <p className="font-bold">⚠️ Firebase Configuration Required</p>
          <p>
            Client environment variables (<code>NEXT_PUBLIC_FIREBASE_API_KEY</code>, <code>NEXT_PUBLIC_FIREBASE_PROJECT_ID</code>) are missing.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3.5 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 font-bold rounded-xl text-sm flex items-center justify-center gap-3 transition shadow-lg"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 text-slate-700 animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>

      <p className="text-center text-xs text-slate-500 mt-8">
        By continuing, you authorize Brain Box AI to securely manage your personal automation workflows.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-[400px] bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent blur-3xl pointer-events-none" />

      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-2xl text-indigo-400 mb-8 z-10"
      >
        <Brain className="w-7 h-7 text-indigo-500" />
        <span>Brain Box AI</span>
      </Link>

      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </div>
  );
}
