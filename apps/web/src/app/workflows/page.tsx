"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import {
  Brain,
  Play,
  Save,
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Settings,
  HelpCircle,
  Plus,
  Trash2,
  ListRestart,
  Loader2,
  AlertCircle
} from "lucide-react";
import Link from "next/link";

const ReactFlowWrapper = dynamic(() => import("./reactflow-wrapper"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <span className="ml-2 font-medium">Loading Workflow Editor...</span>
    </div>
  ),
});

export default function WorkflowsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const storedToken = localStorage.getItem("token");
      if (!user && !storedToken) {
        router.push("/login");
        return;
      }

      if (user) {
        const idToken = await user.getIdToken();
        localStorage.setItem("token", idToken);
        setToken(idToken);
      } else if (storedToken) {
        setToken(storedToken);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  if (loading || !token) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-2 font-medium">Restoring session...</span>
      </div>
    );
  }

  return <ReactFlowWrapper token={token} />;
}
