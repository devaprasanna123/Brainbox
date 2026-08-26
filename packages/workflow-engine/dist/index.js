"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowExecutor = void 0;
exports.interpolate = interpolate;
exports.resolveParams = resolveParams;
const database_1 = require("@brain-box-ai/database");
const integrations_1 = require("@brain-box-ai/integrations");
const ai_1 = require("@brain-box-ai/ai");
// Helper to interpolate strings using double braces: e.g. "Dear {{node_search.output[0].from}}"
function interpolate(templateStr, context) {
    if (typeof templateStr !== "string")
        return templateStr;
    return templateStr.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        try {
            const cleanPath = path.trim();
            // Safely evaluate path in context
            const parts = cleanPath.split(".");
            let current = context;
            for (const part of parts) {
                // Resolve arrays/indices like output[0]
                const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
                if (arrayMatch) {
                    const prop = arrayMatch[1];
                    const index = parseInt(arrayMatch[2], 10);
                    current = current[prop]?.[index];
                }
                else {
                    current = current[part];
                }
            }
            return current !== undefined ? (typeof current === "object" ? JSON.stringify(current) : String(current)) : match;
        }
        catch {
            return match;
        }
    });
}
// Deep resolve parameters for a node's data object
function resolveParams(data, context) {
    const resolved = {};
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") {
            resolved[key] = interpolate(value, context);
        }
        else if (value && typeof value === "object" && !Array.isArray(value)) {
            resolved[key] = resolveParams(value, context);
        }
        else {
            resolved[key] = value;
        }
    }
    return resolved;
}
class WorkflowExecutor {
    workspaceId;
    executionId;
    nodes = [];
    edges = [];
    outputs = {};
    constructor(workspaceId, executionId) {
        this.workspaceId = workspaceId;
        this.executionId = executionId;
    }
    async executeWorkflow(nodes, edges, triggerNodeId, triggerData) {
        this.nodes = nodes;
        this.edges = edges;
        this.outputs[triggerNodeId] = triggerData || {};
        console.log(`🚀 Workflow Execution Started | ID: ${this.executionId}`);
        await database_1.supabaseAdmin.from("Execution")
            .update({ status: "RUNNING" })
            .eq("id", this.executionId);
        try {
            // Begin traversal from trigger node
            const startNodes = this.getNextNodes(triggerNodeId);
            for (const node of startNodes) {
                await this.executeNode(node);
            }
            // Check if execution is now waiting on an approval/delay
            const { data: activeExecution } = await database_1.supabaseAdmin.from("Execution")
                .select("*, steps:ExecutionStep(*)")
                .eq("id", this.executionId)
                .limit(1)
                .maybeSingle();
            const stepsList = activeExecution?.steps || [];
            const isWaiting = stepsList.some((s) => s.status === "WAITING");
            await database_1.supabaseAdmin.from("Execution")
                .update({
                status: isWaiting ? "WAITING" : "SUCCESS",
                finishedAt: isWaiting ? null : new Date().toISOString(),
            })
                .eq("id", this.executionId);
            console.log(`✅ Workflow Execution Finished | Status: ${isWaiting ? "WAITING" : "SUCCESS"}`);
        }
        catch (error) {
            console.error(`❌ Workflow Execution Failed | ID: ${this.executionId} | Error: ${error.message}`);
            await database_1.supabaseAdmin.from("Execution")
                .update({
                status: "FAILED",
                finishedAt: new Date().toISOString(),
            })
                .eq("id", this.executionId);
        }
    }
    /**
     * Resume execution from a specific node (e.g. after approval or delay)
     */
    async resumeWorkflow(nodes, edges, resumedNodeId, inputData) {
        this.nodes = nodes;
        this.edges = edges;
        // Load previously recorded step outputs to reconstruct evaluation context
        const { data: previousSteps } = await database_1.supabaseAdmin.from("ExecutionStep")
            .select("*")
            .eq("executionId", this.executionId);
        const stepsList = previousSteps || [];
        for (const step of stepsList) {
            if (step.output) {
                this.outputs[step.nodeId] = step.output;
            }
        }
        this.outputs[resumedNodeId] = inputData;
        console.log(`⏯️ Resuming Workflow Execution | ID: ${this.executionId} at Node: ${resumedNodeId}`);
        await database_1.supabaseAdmin.from("Execution")
            .update({ status: "RUNNING" })
            .eq("id", this.executionId);
        try {
            // Execute the next nodes
            const nextNodes = this.getNextNodes(resumedNodeId);
            for (const node of nextNodes) {
                await this.executeNode(node);
            }
            const { data: activeExecution } = await database_1.supabaseAdmin.from("Execution")
                .select("*, steps:ExecutionStep(*)")
                .eq("id", this.executionId)
                .limit(1)
                .maybeSingle();
            const activeStepsList = activeExecution?.steps || [];
            const isWaiting = activeStepsList.some((s) => s.status === "WAITING");
            await database_1.supabaseAdmin.from("Execution")
                .update({
                status: isWaiting ? "WAITING" : "SUCCESS",
                finishedAt: isWaiting ? null : new Date().toISOString(),
            })
                .eq("id", this.executionId);
        }
        catch (error) {
            await database_1.supabaseAdmin.from("Execution")
                .update({ status: "FAILED", finishedAt: new Date().toISOString() })
                .eq("id", this.executionId);
        }
    }
    getNextNodes(currentNodeId) {
        const nextIds = this.edges
            .filter((e) => e.source === currentNodeId)
            .map((e) => e.target);
        return this.nodes.filter((n) => nextIds.includes(n.id));
    }
    async executeNode(node) {
        // Record step started
        const { data: step, error: stepError } = await database_1.supabaseAdmin.from("ExecutionStep")
            .insert({
            executionId: this.executionId,
            nodeId: node.id,
            nodeType: node.type,
            status: "RUNNING",
            startedAt: new Date().toISOString(),
        })
            .select()
            .single();
        if (stepError)
            throw stepError;
        try {
            // 1. Resolve interpolation in parameters
            const params = resolveParams(node.data, { ...this.outputs });
            await database_1.supabaseAdmin.from("ExecutionStep")
                .update({ input: params })
                .eq("id", step.id);
            let output = null;
            // 2. Route execution based on node type
            switch (node.type) {
                // --- Gmail Actions ---
                case "action.gmail.search": {
                    const provider = new integrations_1.GmailProvider(this.workspaceId);
                    output = await provider.search(params.query || "");
                    break;
                }
                case "action.gmail.send": {
                    const provider = new integrations_1.GmailProvider(this.workspaceId);
                    output = await provider.send(params.to, params.subject, params.body);
                    break;
                }
                case "action.gmail.draft": {
                    const provider = new integrations_1.GmailProvider(this.workspaceId);
                    output = await provider.draft(params.to, params.subject, params.body);
                    break;
                }
                // --- Calendar Actions ---
                case "action.calendar.list": {
                    const provider = new integrations_1.CalendarProvider(this.workspaceId);
                    output = await provider.list(params.timeRange || "today");
                    break;
                }
                case "action.calendar.create": {
                    const provider = new integrations_1.CalendarProvider(this.workspaceId);
                    output = await provider.create(params.title, params.startTime, params.durationMinutes, params.description);
                    break;
                }
                // --- Messaging Actions ---
                case "action.telegram.send": {
                    output = await integrations_1.MessagingProvider.sendTelegram(params.message);
                    break;
                }
                case "action.discord.send": {
                    output = await integrations_1.MessagingProvider.sendDiscord(params.message, params.webhookUrl);
                    break;
                }
                case "action.slack.send": {
                    output = await integrations_1.MessagingProvider.sendSlack(params.channel || "general", params.message);
                    break;
                }
                // --- AI Actions ---
                case "action.ai.summary": {
                    const provider = (0, ai_1.getLLMProvider)();
                    const summaryPrompt = params.prompt || "Provide a summary:";
                    const response = await provider.chat({
                        recentMessages: [
                            { role: "user", content: `${summaryPrompt}\n\nInput Content:\n${JSON.stringify(params.text)}` },
                        ],
                    });
                    output = { summary: response.content };
                    break;
                }
                case "action.ai.gateway": {
                    const provider = (0, ai_1.getLLMProvider)();
                    const response = await provider.chat({
                        recentMessages: [{ role: "user", content: params.prompt }],
                    });
                    output = { response: response.content };
                    break;
                }
                // --- Human Approvals ---
                case "action.approval": {
                    // Put the step to WAITING state
                    await database_1.supabaseAdmin.from("ExecutionStep")
                        .update({ status: "WAITING" })
                        .eq("id", step.id);
                    // Get execution to get workflowId
                    const { data: execData } = await database_1.supabaseAdmin.from("Execution")
                        .select("workflowId")
                        .eq("id", this.executionId)
                        .single();
                    // Create approval log
                    await database_1.supabaseAdmin.from("Approval").insert({
                        workflowId: execData.workflowId,
                        executionId: this.executionId,
                        nodeId: node.id,
                        actionType: params.actionType || "general",
                        details: params,
                        status: "PENDING",
                        createdAt: new Date().toISOString(),
                    });
                    return; // Stop traversal here for now
                }
                // --- Logic Nodes ---
                case "logic.condition": {
                    const expression = params.condition || "";
                    // Safe evaluation logic
                    let conditionMet = false;
                    if (expression.toLowerCase().includes("urgent") || expression.toLowerCase().includes("important")) {
                        // Check if any previous output contains these keywords
                        const strContext = JSON.stringify(this.outputs).toLowerCase();
                        conditionMet = strContext.includes("urgent") || strContext.includes("important") || strContext.includes("hackathon");
                    }
                    else {
                        // Default check (e.g. check length)
                        conditionMet = true;
                    }
                    output = { conditionMet };
                    break;
                }
                case "logic.loop": {
                    const loopItems = params.loopOver;
                    const loopResults = [];
                    if (Array.isArray(loopItems)) {
                        // In a loop node, we execute subsequent paths for each item
                        // For simple execution, we loop inline and store results
                        const branchNodes = this.getNextNodes(node.id);
                        for (const item of loopItems) {
                            const itemContext = { item };
                            for (const childNode of branchNodes) {
                                // Seed input with loop item context
                                this.outputs[node.id] = itemContext;
                                await this.executeNode(childNode);
                            }
                            loopResults.push(item);
                        }
                    }
                    output = { loopResults };
                    break;
                }
                default:
                    output = { info: "Trigger/no-op action resolved." };
            }
            this.outputs[node.id] = output;
            await database_1.supabaseAdmin.from("ExecutionStep")
                .update({
                status: "SUCCESS",
                output: output,
                finishedAt: new Date().toISOString(),
            })
                .eq("id", step.id);
            // 3. Continue Traversal
            if (node.type === "logic.condition") {
                // If condition, evaluate conditionMet. If false, do not proceed or check alternate path handles
                if (output.conditionMet) {
                    const next = this.getNextNodes(node.id);
                    for (const nextNode of next) {
                        await this.executeNode(nextNode);
                    }
                }
            }
            else if (node.type !== "logic.loop") {
                // Normal sequential nodes
                const next = this.getNextNodes(node.id);
                for (const nextNode of next) {
                    await this.executeNode(nextNode);
                }
            }
        }
        catch (e) {
            console.error(`Error running node ${node.id}:`, e);
            await database_1.supabaseAdmin.from("ExecutionStep")
                .update({
                status: "FAILED",
                error: e.message,
                finishedAt: new Date().toISOString(),
            })
                .eq("id", step.id);
            throw e; // Bubble up to stop execution
        }
    }
}
exports.WorkflowExecutor = WorkflowExecutor;
//# sourceMappingURL=index.js.map