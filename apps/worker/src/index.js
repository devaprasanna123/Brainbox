"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerQueue = void 0;
exports.calculateNextRun = calculateNextRun;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load env vars
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../../.env") });
const database_1 = require("@brain-box-ai/database");
const workflow_engine_1 = require("@brain-box-ai/workflow-engine");
const bullmq_1 = require("bullmq");
const cron_parser_1 = __importDefault(require("cron-parser"));
const REDIS_URL = process.env.REDIS_URL;
const USE_REDIS = !!REDIS_URL && REDIS_URL.trim() !== "";
console.log(`🤖 Starting Brain Box AI Worker...`);
console.log(`📡 Queue system: ${USE_REDIS ? "BullMQ (Redis)" : "In-Memory Database Poller"}`);
// --- Queue Abstraction ---
class WorkerQueue {
    bullQueue = null;
    static instance;
    inMemoryJobs = [];
    constructor() {
        if (USE_REDIS) {
            this.bullQueue = new bullmq_1.Queue("workflow-queue", {
                connection: {
                    url: REDIS_URL,
                },
            });
        }
    }
    static getInstance() {
        if (!WorkerQueue.instance) {
            WorkerQueue.instance = new WorkerQueue();
        }
        return WorkerQueue.instance;
    }
    async addJob(data) {
        if (USE_REDIS && this.bullQueue) {
            await this.bullQueue.add(data.type, data);
        }
        else {
            console.log(`📥 [In-Memory Queue] Enqueued job: ${data.type} for execution ${data.executionId}`);
            this.inMemoryJobs.push(data);
            // Process immediately (async)
            this.processInMemoryNext();
        }
    }
    async processInMemoryNext() {
        const jobData = this.inMemoryJobs.shift();
        if (!jobData)
            return;
        try {
            await processWorkflowJob(jobData);
        }
        catch (e) {
            console.error(`Error processing in-memory job ${jobData.executionId}:`, e);
        }
    }
}
exports.WorkerQueue = WorkerQueue;
// --- Job Processing ---
async function processWorkflowJob(data) {
    const { type, workspaceId, executionId, workflowId, triggerNodeId, triggerData, resumedNodeId, resumedData } = data;
    // Fetch active workflow version
    const workflow = await database_1.prisma.workflow.findUnique({
        where: { id: workflowId },
        include: {
            versions: {
                orderBy: { version: "desc" },
                take: 1,
            },
        },
    });
    if (!workflow || workflow.versions.length === 0) {
        console.error(`Workflow ${workflowId} or active version not found.`);
        await database_1.prisma.execution.update({
            where: { id: executionId },
            data: { status: "FAILED", finishedAt: new Date() },
        });
        return;
    }
    const activeVersion = workflow.versions[0];
    const nodes = activeVersion.nodes;
    const edges = activeVersion.edges;
    const executor = new workflow_engine_1.WorkflowExecutor(workspaceId, executionId);
    if (type === "workflow.execute") {
        await executor.executeWorkflow(nodes, edges, triggerNodeId, triggerData);
    }
    else if (type === "workflow.resume") {
        await executor.resumeWorkflow(nodes, edges, resumedNodeId, resumedData);
    }
}
// --- Initialize BullMQ Worker (if using Redis) ---
if (USE_REDIS) {
    const worker = new bullmq_1.Worker("workflow-queue", async (job) => {
        console.log(`📦 [BullMQ] Processing job ${job.id} | Type: ${job.name}`);
        await processWorkflowJob(job.data);
    }, {
        connection: {
            url: REDIS_URL,
        },
    });
    worker.on("completed", (job) => {
        console.log(`✅ [BullMQ] Job ${job.id} completed!`);
    });
    worker.on("failed", (job, err) => {
        console.error(`❌ [BullMQ] Job ${job?.id} failed: ${err.message}`);
    });
}
// --- Timezone-aware Scheduler Poller ---
async function pollSchedules() {
    try {
        const now = new Date();
        // Find active schedules that are due to execute
        const schedulesDue = await database_1.prisma.schedule.findMany({
            where: {
                nextRun: {
                    lte: now,
                },
                workflow: {
                    status: "ACTIVE",
                },
            },
            include: {
                workflow: true,
            },
        });
        for (const schedule of schedulesDue) {
            console.log(`⏰ Schedule triggered for workflow ${schedule.workflowId} (${schedule.workflow.title})`);
            // 1. Create an execution history entry
            const execution = await database_1.prisma.execution.create({
                data: {
                    workflowId: schedule.workflowId,
                    status: "RUNNING",
                    triggerType: "schedule",
                    triggerData: { scheduleId: schedule.id, cron: schedule.cron },
                    startedAt: new Date(),
                },
            });
            // 2. Queue the execution job
            await WorkerQueue.getInstance().addJob({
                type: "workflow.execute",
                workspaceId: schedule.workflow.workspaceId,
                executionId: execution.id,
                workflowId: schedule.workflowId,
                triggerNodeId: "node_trigger", // Standard trigger node name in generated templates
                triggerData: { triggeredAt: now.toISOString() },
            });
            // 3. Compute and update nextRun time
            const nextRunDate = calculateNextRun(schedule.cron, schedule.timezone);
            await database_1.prisma.schedule.update({
                where: { id: schedule.id },
                data: {
                    nextRun: nextRunDate,
                },
            });
            console.log(`📅 Updated next schedule run to: ${nextRunDate.toISOString()}`);
        }
    }
    catch (e) {
        console.error("Error polling schedules:", e);
    }
}
// Helper to compute next run time from cron and timezone
function calculateNextRun(cronExpression, timezone = "UTC") {
    try {
        const options = {
            currentDate: new Date(),
            tz: timezone,
        };
        const interval = cron_parser_1.default.parseExpression(cronExpression, options);
        return interval.next().toDate();
    }
    catch (err) {
        console.error(`Failed to parse cron expression "${cronExpression}":`, err);
        // Default fallback to 1 hour from now
        return new Date(Date.now() + 3600000);
    }
}
// Initialize Poller (runs every 10 seconds in development)
console.log("⏱️ Starting schedule polling loop (every 10s)...");
setInterval(pollSchedules, 10000);
// Also run initial scheduler calculations for any active schedules that have nextRun = null
async function initializeSchedules() {
    const nullSchedules = await database_1.prisma.schedule.findMany({
        where: {
            nextRun: null,
            workflow: { status: "ACTIVE" },
        },
    });
    for (const schedule of nullSchedules) {
        const nextRun = calculateNextRun(schedule.cron, schedule.timezone);
        await database_1.prisma.schedule.update({
            where: { id: schedule.id },
            data: { nextRun },
        });
        console.log(`🗓️ Configured initial schedule run for ${schedule.workflowId} to ${nextRun.toISOString()}`);
    }
}
initializeSchedules();
//# sourceMappingURL=index.js.map