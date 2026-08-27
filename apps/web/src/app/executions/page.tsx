"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import {
  Brain,
  ArrowLeft,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Loader2,
  RefreshCw,
  Cpu,
  Workflow
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ExecutionsPage() {
  const router = useRouter();

  const [executions, setExecutions] = useState<any[]>([]);
  const [selectedExec, setSelectedExec] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [execDetail, setExecDetail] = useState<any | null>(null);

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") || "" : ""}`,
  });

  const [sessionRestored, setSessionRestored] = useState(false);

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
      }

      setSessionRestored(true);
      fetchExecutions();
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/executions`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setExecutions(data);
      }
    } catch {}
    setLoading(false);
  };

  const fetchExecutionDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/executions/${id}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setExecDetail(data);
      }
    } catch {}
  };

  const selectExecution = (exec: any) => {
    setSelectedExec(exec);
    setExecDetail(null);
    fetchExecutionDetail(exec.id);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "FAILED":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "RUNNING":
        return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  if (!sessionRestored) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-550" />
        <span className="ml-2 font-medium">Restoring session...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-12">
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
              <Activity className="w-5 h-5 text-indigo-450" />
              <span>Execution History</span>
            </h1>
          </div>
          <button
            onClick={fetchExecutions}
            className="p-2 border border-slate-900 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </header>

        {/* List & Detail Splitted Pane */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Executions List Pane */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Workflow runs</h2>
            
            {loading && executions.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : executions.length === 0 ? (
              <div className="text-center py-20 border border-slate-900 rounded-2xl text-slate-600 text-sm bg-slate-900/10">
                No executions run yet. Run a test from the workflow builder!
              </div>
            ) : (
              <div className="border border-slate-900 rounded-2xl overflow-hidden bg-slate-900/10">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-950/60 font-semibold text-slate-500">
                      <th className="p-4">Workflow</th>
                      <th className="p-4">Trigger</th>
                      <th className="p-4">Started At</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60">
                    {executions.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => selectExecution(e)}
                        className={`hover:bg-slate-900/40 cursor-pointer transition ${
                          selectedExec?.id === e.id ? "bg-slate-900/80" : ""
                        }`}
                      >
                        <td className="p-4 font-bold text-white flex items-center gap-1.5">
                          <Workflow className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{e.workflow?.title || "Workflow"}</span>
                        </td>
                        <td className="p-4 text-slate-400 capitalize">{e.triggerType}</td>
                        <td className="p-4 text-slate-500">
                          {new Date(e.startedAt).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className="flex items-center gap-1.5">
                            {getStatusIcon(e.status)}
                            <span className="text-[10px] font-semibold">{e.status}</span>
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <ChevronRight className="w-4 h-4 text-slate-500 inline" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Details Pane */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Step Log trace</h2>

            {selectedExec ? (
              <div className="border border-slate-900 bg-slate-900/20 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wide">Execution Run Details</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">ID: {selectedExec.id}</p>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  {execDetail ? (
                    execDetail.steps.length === 0 ? (
                      <p className="text-xs text-slate-500">No steps recorded in execution.</p>
                    ) : (
                      execDetail.steps.map((step: any, index: number) => (
                        <div key={step.id} className="relative flex gap-4 items-start">
                          {/* Dot connector line */}
                          {index < execDetail.steps.length - 1 && (
                            <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-slate-900" />
                          )}
                          <div className="w-5 h-5 rounded-full bg-slate-950 flex items-center justify-center flex-shrink-0 z-10">
                            {getStatusIcon(step.status)}
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-950/40 border border-slate-900/60 rounded-xl p-3 text-[10px]">
                            <div className="flex items-center justify-between font-bold text-white uppercase tracking-wider mb-1">
                              <span className="truncate">{step.nodeType.split(".").pop()}</span>
                              <span className="text-slate-500 text-[8px]">
                                {step.finishedAt
                                  ? `${Math.round(
                                      (new Date(step.finishedAt).getTime() -
                                        new Date(step.startedAt).getTime()) /
                                        10
                                    ) / 100}s`
                                  : "Pending"}
                              </span>
                            </div>
                            {step.input && (
                              <div className="mt-1 text-slate-500 font-mono">
                                <span className="text-slate-650">Input:</span>{" "}
                                <span className="text-slate-400">{JSON.stringify(step.input)}</span>
                              </div>
                            )}
                            {step.output && (
                              <div className="mt-1 text-slate-500 font-mono">
                                <span className="text-slate-650">Output:</span>{" "}
                                <span className="text-emerald-400">{JSON.stringify(step.output)}</span>
                              </div>
                            )}
                            {step.error && (
                              <div className="mt-1.5 p-2 bg-red-950/20 border border-red-500/20 text-red-300 rounded font-mono">
                                {step.error}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-slate-900 border-dashed rounded-2xl p-6 text-center text-xs text-slate-600">
                Select an execution run from the left panel to inspect step outputs.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
