"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import {
  Brain,
  ArrowLeft,
  Settings,
  User,
  Shield,
  Volume2,
  Database,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  Link as LinkIcon
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function SettingsPage() {
  const router = useRouter();

  const [preferences, setPreferences] = useState({
    theme: "system",
    timezone: "UTC",
    voiceInput: true,
    voiceAutoSend: false,
    voiceResponse: false,
  });

  const [credentials, setCredentials] = useState<any[]>([]);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; status: string; email?: string; error?: string; services?: any }>({
    connected: false,
    status: "DISCONNECTED",
  });
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user && !localStorage.getItem("token")) {
        router.push("/login");
        return;
      }

      if (user) {
        const idToken = await user.getIdToken();
        localStorage.setItem("token", idToken);
        localStorage.setItem("user", JSON.stringify({ id: user.uid, email: user.email, name: user.displayName }));
      }

      setSessionRestored(true);
      fetchSettings();
      fetchIntegrations();
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const pref = data.data || data;
        if (pref) setPreferences((prev) => ({ ...prev, ...pref }));
      }
    } catch {}
  };

  const fetchIntegrations = async () => {
    try {
      const [resCreds, resStatus] = await Promise.all([
        fetch(`${API_URL}/api/integrations`, { headers: getHeaders() }),
        fetch(`${API_URL}/api/integrations/google/status`, { headers: getHeaders() }),
      ]);
      if (resCreds.ok) {
        const data = await resCreds.json();
        const items = data.data?.credentials || data.credentials || [];
        setCredentials(items);
      }
      if (resStatus.ok) {
        const statusData = await resStatus.json();
        setGoogleStatus({
          connected: statusData.connected || false,
          status: statusData.status || (statusData.connected ? "CONNECTED" : "DISCONNECTED"),
          email: statusData.email || statusData.googleEmail,
          error: statusData.error,
          services: statusData.services || {
            gmail: statusData.gmail,
            calendar: statusData.calendar,
            drive: statusData.drive,
            sheets: statusData.sheets,
          },
        });
      }
    } catch {}
  };

  const handlePreferenceChange = (key: string, value: any) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleSavePreferences = async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(preferences),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch {
      alert("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const res = await fetch(`${API_URL}/api/integrations/google/connect`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error?.message || data.error || "Google OAuth is not configured on the server.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to initiate Google OAuth.");
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm("Are you sure you want to disconnect Google Calendar, Gmail, Drive & Sheets?")) return;
    try {
      const res = await fetch(`${API_URL}/api/integrations/google/disconnect`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (res.ok) {
        setCredentials([]);
        setGoogleStatus({ connected: false, status: "DISCONNECTED" });
      }
    } catch {}
  };

  if (!sessionRestored) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-2 font-medium">Restoring session...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="p-2 border border-slate-900 bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              <span>Brain Box Settings</span>
            </h1>
          </div>
        </header>

        {/* Settings Grid */}
        <div className="space-y-8">
          {/* Preferences Section */}
          <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Volume2 className="w-4.5 h-4.5" />
              <span>Preferences & Voice</span>
            </h2>

            <div className="space-y-6">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">Interface Theme</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Select visual theme preference</p>
                </div>
                <select
                  value={preferences.theme}
                  onChange={(e) => handlePreferenceChange("theme", e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="system">System Default</option>
                  <option value="dark">Dark Theme</option>
                  <option value="light">Light Theme</option>
                </select>
              </div>

              {/* Timezone */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">User Timezone</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Used for scheduling calendar events and relative date parsing</p>
                </div>
                <select
                  value={preferences.timezone}
                  onChange={(e) => handlePreferenceChange("timezone", e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                  <option value="UTC">UTC (+00:00)</option>
                  <option value="America/New_York">America/New_York (EST -05:00)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST -08:00)</option>
                  <option value="Europe/London">Europe/London (GMT +00:00)</option>
                </select>
              </div>

              {/* Push to Talk Auto Send */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">Voice Input Auto-Send</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Automatically submit text when speech finishes</p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePreferenceChange("voiceAutoSend", !preferences.voiceAutoSend)}
                  className={`w-10 h-6 rounded-full transition p-1 flex items-center ${
                    preferences.voiceAutoSend ? "bg-indigo-600 justify-end" : "bg-slate-800 justify-start"
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                {saveSuccess && <span className="text-xs text-green-400 font-semibold">Preferences saved ✓</span>}
                <button
                  onClick={handleSavePreferences}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Preferences"}
                </button>
              </div>
            </div>
          </section>

          {/* Integrations Section */}
          <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-6 flex items-center gap-2">
              <LinkIcon className="w-4.5 h-4.5" />
              <span>Google Workspace Connection</span>
            </h2>

            <div className="space-y-4">
              {(() => {
                const googleCred = credentials.find((c) => c.type === "google");
                const accountEmail = googleStatus.email || (googleCred?.name?.includes("Google (") ? googleCred.name.replace("Google (", "").replace(")", "") : "");
                const isConnected = googleStatus.connected || !!googleCred;
                const svcs = googleStatus.services;

                return (
                  <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center font-bold text-indigo-400 text-lg">
                          G
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">Google Workspace</p>
                          {isConnected ? (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Google Account: <span className="text-indigo-400 font-semibold">{accountEmail || "Connected"}</span>
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {googleStatus.error || "Connect Google Account to enable Gmail, Drive, Sheets & Calendar capabilities"}
                            </p>
                          )}
                        </div>
                      </div>

                      {isConnected ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-green-400 bg-green-950/20 border border-green-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Connected ✓
                          </span>
                          <button
                            onClick={handleConnectGoogle}
                            className="px-3 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold transition"
                          >
                            Reconnect
                          </button>
                          <button
                            onClick={handleDisconnectGoogle}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded transition"
                            title="Disconnect Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectGoogle}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 transition rounded-lg text-xs font-bold text-white shadow-lg flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Connect Google</span>
                        </button>
                      )}
                    </div>

                    {/* Service Capabilities Grid */}
                    {isConnected && (
                      <div className="space-y-3 pt-2 border-t border-slate-900">
                        <div className="grid grid-cols-4 gap-2">
                          {/* Gmail */}
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400">Gmail</p>
                            <p className={`text-xs font-bold mt-1 ${svcs?.gmail?.available ? "text-green-400" : svcs?.gmail?.status === "API_DISABLED" ? "text-amber-400" : "text-slate-400"}`}>
                              {svcs?.gmail?.available ? "Available ✓" : svcs?.gmail?.status === "API_DISABLED" ? "API Disabled" : "Available"}
                            </p>
                          </div>

                          {/* Calendar */}
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400">Calendar</p>
                            <p className={`text-xs font-bold mt-1 ${svcs?.calendar?.available ? "text-green-400" : svcs?.calendar?.status === "API_DISABLED" ? "text-amber-400" : "text-green-400"}`}>
                              {svcs?.calendar?.available ? "Available ✓" : svcs?.calendar?.status === "API_DISABLED" ? "API Disabled" : "Available ✓"}
                            </p>
                          </div>

                          {/* Drive */}
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400">Drive</p>
                            <p className={`text-xs font-bold mt-1 ${svcs?.drive?.available !== false ? "text-green-400" : "text-amber-400"}`}>
                              {svcs?.drive?.available !== false ? "Available ✓" : "API Disabled"}
                            </p>
                          </div>

                          {/* Sheets */}
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400">Sheets</p>
                            <p className={`text-xs font-bold mt-1 ${svcs?.sheets?.available !== false ? "text-green-400" : "text-amber-400"}`}>
                              {svcs?.sheets?.available !== false ? "Available ✓" : "API Disabled"}
                            </p>
                          </div>
                        </div>

                        {/* Informative banner if an API is disabled */}
                        {svcs?.calendar?.status === "API_DISABLED" && (
                          <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-200">Google Calendar API is disabled</p>
                              <p className="text-[10px] text-amber-300/80 mt-0.5">
                                To enable event creation, turn on the Google Calendar API in Google Cloud Console for project 412264053150. Gmail and other services remain active and usable.
                              </p>
                            </div>
                          </div>
                        )}
                        {svcs?.gmail?.status === "API_DISABLED" && (
                          <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-200">Gmail API is disabled</p>
                              <p className="text-[10px] text-amber-300/80 mt-0.5">
                                Turn on the Gmail API in Google Cloud Console for project 412264053150.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
