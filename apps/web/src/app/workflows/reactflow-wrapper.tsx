"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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
  AlertCircle,
  CheckCircle,
  Mail,
  Calendar,
  Slack,
  MessageSquare,
  AlertTriangle
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ReactFlowWrapperProps {
  token: string;
}

export default function ReactFlowWrapper({ token }: ReactFlowWrapperProps) {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [copilotInput, setCopilotInput] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  
  const [workflowStatus, setWorkflowStatus] = useState<string>("DRAFT");
  const [workflowTitle, setWorkflowTitle] = useState("");

  const getHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  });

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workflows`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data);
        if (data.length > 0 && !activeWorkflowId) {
          loadWorkflow(data[0]);
        }
      }
    } catch {}
  };

  const loadWorkflow = (w: any) => {
    setActiveWorkflowId(w.id);
    setWorkflowStatus(w.status);
    setWorkflowTitle(w.title);
    
    // Load last version
    if (w.schedules && w.schedules.length > 0) {
      // schedules preloaded
    }
    fetchWorkflowDetail(w.id);
  };

  const fetchWorkflowDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/workflows/${id}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const loadedNodes = data.nodes || [];
        const loadedEdges = data.edges || [];

        setNodes(loadedNodes.map((n: any) => ({
          ...n,
          data: { ...n.data, label: getNodeLabel(n.type) },
        })));
        setEdges(loadedEdges);
      }
    } catch {}
  };

  const getNodeLabel = (type: string) => {
    switch (type) {
      case "trigger.schedule": return "📅 Timer Trigger";
      case "trigger.manual": return "⚡ Manual Trigger";
      case "trigger.webhook": return "🔗 Webhook Trigger";
      case "action.gmail.search": return "📨 Search Gmail";
      case "action.gmail.send": return "✉️ Send Gmail";
      case "action.gmail.draft": return "📝 Draft Gmail";
      case "action.calendar.create": return "📆 Create Event";
      case "action.calendar.list": return "📅 List Calendar";
      case "action.slack.send": return "💬 Send Slack";
      case "action.discord.send": return "👾 Send Discord";
      case "action.telegram.send": return "✈️ Send Telegram";
      case "action.ai.summary": return "🧠 AI Summarize";
      case "action.ai.gateway": return "🧠 AI Prompt";
      case "action.approval": return "⚠️ Human Approval";
      case "logic.condition": return "❓ IF/ELSE Condition";
      case "logic.loop": return "🔄 Loop Items";
      default: return "Node Action";
    }
  };

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const handleAddNode = (type: string) => {
    const id = "node_" + Math.random().toString(36).substr(2, 9);
    const newNode = {
      id,
      type,
      position: { x: 300, y: 200 },
      data: { label: getNodeLabel(type) },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleDeleteNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleNodeClick = (event: any, node: any) => {
    setSelectedNodeId(node.id);
  };

  const handleNodeDataChange = (key: string, val: any) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              [key]: val,
            },
          };
        }
        return n;
      })
    );
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const handleCreateWorkflow = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workflows`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          title: "New Workflow",
          description: "Created via Workflow Builder",
          nodes: [
            {
              id: "node_trigger",
              type: "trigger.manual",
              position: { x: 100, y: 150 },
              data: {},
            }
          ],
          edges: [],
        }),
      });
      if (res.ok) {
        const newWf = await res.json();
        setWorkflows((prev) => [newWf, ...prev]);
        loadWorkflow(newWf);
      }
    } catch {
      alert("Failed to create workflow.");
    }
  };

  const handleSaveWorkflow = async () => {
    if (!activeWorkflowId) return;
    setSaveLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/workflows/${activeWorkflowId}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
          title: workflowTitle,
          nodes: nodes.map((n) => ({ id: n.id, type: n.type || "action", data: n.data, position: n.position })),
          edges,
        }),
      });
      if (res.ok) {
        alert("Workflow saved successfully!");
      }
    } catch {
      alert("Failed to save workflow.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleActivation = async () => {
    if (!activeWorkflowId) return;
    const isActivating = workflowStatus !== "ACTIVE";
    const endpoint = isActivating ? "activate" : "pause";
    try {
      const res = await fetch(`${API_URL}/api/workflows/${activeWorkflowId}/${endpoint}`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (res.ok) {
        setWorkflowStatus(isActivating ? "ACTIVE" : "PAUSED");
      }
    } catch {}
  };

  const handleTestWorkflow = async () => {
    if (!activeWorkflowId) return;
    setTestLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/workflows/${activeWorkflowId}/test`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (res.ok) {
        alert("Workflow test run queued!");
      }
    } catch {
      alert("Failed to queue workflow test run.");
    } finally {
      setTestLoading(false);
    }
  };

  // AI Copilot Integration
  const handleCopilotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotInput.trim()) return;

    setCopilotLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/generate-workflow`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ input: copilotInput }),
      });
      if (res.ok) {
        const plan = await res.json();
        
        // Load generated plan into React Flow
        setNodes(plan.nodes.map((n: any) => ({
          ...n,
          data: { ...n.data, label: getNodeLabel(n.type) },
        })));
        setEdges(plan.edges);
        setWorkflowTitle(plan.title);
        
        setCopilotInput("");
      }
    } catch {
      alert("AI was unable to generate workflow plan. Retry.");
    } finally {
      setCopilotLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Left panel: workflows list & toolbox */}
      <aside className="w-80 border-r border-slate-900 bg-slate-900/40 flex flex-col h-full flex-shrink-0">
        <div className="p-4 border-b border-slate-900 flex items-center justify-between">
          <Link href="/chat" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Chat</span>
          </Link>
          <span className="text-[10px] uppercase font-bold text-slate-500">Workspace</span>
        </div>

        {/* Workflow Selection and Creation */}
        <div className="p-4 border-b border-slate-900 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Active Workflow
            </label>
            <button
              onClick={handleCreateWorkflow}
              className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
          {workflows.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic">No workflows found.</div>
          ) : (
            <select
              value={activeWorkflowId || ""}
              onChange={(e) => {
                const selected = workflows.find((w) => w.id === e.target.value);
                if (selected) loadWorkflow(selected);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-650"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Toolbox Header */}
        <div className="p-4 border-b border-slate-900">
          <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Workflow Toolbox</h2>
          <p className="text-[10px] text-slate-500">Drag or click to add a node to the canvas</p>
        </div>

        {/* Toolbox Nodes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Triggers</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddNode("trigger.schedule")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5"
              >
                <span>📅 Schedule</span>
              </button>
              <button
                onClick={() => handleAddNode("trigger.webhook")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5"
              >
                <span>🔗 Webhook</span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Gmail Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddNode("action.gmail.search")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5"
              >
                <span>📨 Search</span>
              </button>
              <button
                onClick={() => handleAddNode("action.gmail.send")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5"
              >
                <span>✉️ Send</span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Calendar Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddNode("action.calendar.create")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5"
              >
                <span>📆 Create</span>
              </button>
              <button
                onClick={() => handleAddNode("action.calendar.list")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5"
              >
                <span>📅 List</span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">AI Assistants</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => handleAddNode("action.ai.summary")}
                className="p-3 border border-indigo-950 bg-indigo-950/20 hover:bg-indigo-900/10 rounded-lg text-left text-[10px] font-semibold flex items-center gap-2"
              >
                <Brain className="w-4 h-4 text-indigo-400" />
                <span>Summarize text with AI</span>
              </button>
              <button
                onClick={() => handleAddNode("action.ai.gateway")}
                className="p-3 border border-indigo-950 bg-indigo-950/20 hover:bg-indigo-900/10 rounded-lg text-left text-[10px] font-semibold flex items-center gap-2"
              >
                <Brain className="w-4 h-4 text-indigo-400" />
                <span>Custom LLM Prompt Node</span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Integrations</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddNode("action.telegram.send")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold"
              >
                <span>✈️ Telegram</span>
              </button>
              <button
                onClick={() => handleAddNode("action.slack.send")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold"
              >
                <span>💬 Slack</span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Logic flow</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddNode("logic.condition")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold"
              >
                <span>❓ Condition</span>
              </button>
              <button
                onClick={() => handleAddNode("logic.loop")}
                className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-lg text-left text-[10px] font-semibold"
              >
                <span>🔄 Loop Item</span>
              </button>
              <button
                onClick={() => handleAddNode("action.approval")}
                className="p-2 border border-yellow-900/50 bg-yellow-950/20 hover:bg-yellow-900/10 rounded-lg text-left text-[10px] font-semibold col-span-2 flex items-center gap-1 text-yellow-500"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Human Approval</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Center: Canvas Workspace */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative">
        {/* Editor controls header */}
        <header className="px-6 py-4 border-b border-slate-900 flex items-center justify-between z-10 bg-slate-950/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={workflowTitle}
              onChange={(e) => setWorkflowTitle(e.target.value)}
              className="bg-transparent border-none text-base font-bold focus:outline-none focus:border-b border-slate-800 text-white"
            />
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                workflowStatus === "ACTIVE"
                  ? "bg-green-950/30 text-green-400 border-green-500/10"
                  : "bg-slate-950 text-slate-500 border-slate-800"
              }`}
            >
              {workflowStatus}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActivation}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                workflowStatus === "ACTIVE"
                  ? "bg-slate-900 border border-slate-800 hover:bg-slate-800 text-red-400"
                  : "bg-green-600 hover:bg-green-500 text-black shadow-lg shadow-green-600/10"
              }`}
            >
              {workflowStatus === "ACTIVE" ? "Pause Workflow" : "Activate Workflow"}
            </button>

            <button
              onClick={handleTestWorkflow}
              disabled={testLoading}
              className="p-2 border border-slate-850 hover:border-slate-700 bg-slate-950 rounded-lg text-xs text-indigo-400 hover:text-white flex items-center gap-1 transition"
            >
              {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>Test run</span>
            </button>

            <button
              onClick={handleSaveWorkflow}
              disabled={saveLoading}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white font-bold flex items-center gap-1 transition"
            >
              {saveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save</span>
            </button>
          </div>
        </header>

        {/* React Flow Container */}
        <div className="flex-1 relative w-full h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            fitView
            className="bg-slate-950"
          >
            <Controls className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-white" />
            <MiniMap nodeColor="#22c55e" maskColor="rgba(2, 6, 23, 0.7)" className="bg-slate-900/60 border border-slate-800 rounded-lg" />
            <Background color="#1e293b" gap={16} size={1} />
          </ReactFlow>
        </div>
      </main>

      {/* Right panel: dynamic configuration panel & copilot */}
      <aside className="w-80 border-l border-slate-900 bg-slate-900/40 flex flex-col h-full flex-shrink-0">
        {/* Selected Node Properties */}
        <div className="p-4 border-b border-slate-900 flex-1 overflow-y-auto">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Node Configuration</h2>
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{selectedNode.data.label}</span>
                <button
                  onClick={() => handleDeleteNode(selectedNode.id)}
                  className="p-1 hover:text-red-400 rounded transition"
                  title="Delete Node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic node properties form */}
              {selectedNode.type === "trigger.schedule" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Cron Schedule Expression
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.cron || ""}
                      onChange={(e) => handleNodeDataChange("cron", e.target.value)}
                      placeholder="e.g. 0 8 * * 1-5"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[9px] text-slate-500 mt-1">`0 8 * * 1-5` is weekdays at 8:00 AM</p>
                  </div>
                </div>
              )}

              {selectedNode.type === "action.gmail.search" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Search Query Filter
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.query || ""}
                      onChange={(e) => handleNodeDataChange("query", e.target.value)}
                      placeholder="is:unread category:primary"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {selectedNode.type === "action.gmail.send" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Recipient (To)
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.to || ""}
                      onChange={(e) => handleNodeDataChange("to", e.target.value)}
                      placeholder="arun@example.com"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none mb-2"
                    />
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.subject || ""}
                      onChange={(e) => handleNodeDataChange("subject", e.target.value)}
                      placeholder="Daily Briefing"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none mb-2"
                    />
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Email Body Content
                    </label>
                    <textarea
                      rows={4}
                      value={selectedNode.data.body || ""}
                      onChange={(e) => handleNodeDataChange("body", e.target.value)}
                      placeholder="Hi, here is the summary: {{node_ai_summary.output.summary}}"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {selectedNode.type === "action.ai.summary" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Prompt instructions
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.prompt || ""}
                      onChange={(e) => handleNodeDataChange("prompt", e.target.value)}
                      placeholder="Summarize these emails with key points"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none mb-2"
                    />
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Target Text Content to summarize
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.text || ""}
                      onChange={(e) => handleNodeDataChange("text", e.target.value)}
                      placeholder="{{node_gmail_search.output}}"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {selectedNode.type === "action.calendar.create" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Event Title
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.title || ""}
                      onChange={(e) => handleNodeDataChange("title", e.target.value)}
                      placeholder="Submit project"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none mb-2"
                    />
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Start Time
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.startTime || ""}
                      onChange={(e) => handleNodeDataChange("startTime", e.target.value)}
                      placeholder="Tomorrow 10:00 AM"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600 mt-4">Select a node on the canvas to configure it.</p>
          )}
        </div>

        {/* Copilot Chat widget */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/20">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>Ask Brain Box Copilot</span>
          </div>

          <form onSubmit={handleCopilotSubmit} className="space-y-2">
            <textarea
              rows={3}
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              placeholder="e.g. 'Add a Telegram notification after creating calendar event'"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-900 text-xs rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-indigo-600 transition"
            />
            <button
              type="submit"
              disabled={copilotLoading || !copilotInput.trim()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
            >
              {copilotLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Modify with AI</span>
                </>
              )}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
