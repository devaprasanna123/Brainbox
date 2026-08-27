import dotenv from "dotenv";
import path from "path";
// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { supabaseAdmin } from "@brain-box-ai/database";
import { WorkflowExecutor } from "@brain-box-ai/workflow-engine";
import { Queue, Worker, Job } from "bullmq";
import * as cronParser from "cron-parser";

const REDIS_URL = process.env.REDIS_URL;
const USE_REDIS = !!REDIS_URL && REDIS_URL.trim() !== "";

console.log(`🤖 Starting Brain Box AI Worker...`);
console.log(`📡 Queue system: ${USE_REDIS ? "BullMQ (Redis)" : "In-Memory Database Poller"}`);

// --- Job Definitions ---
interface WorkflowJobData {
  type: "workflow.execute" | "workflow.resume";
  workspaceId: string;
  executionId: string;
  workflowId: string;
  triggerNodeId?: string;
  triggerData?: any;
  resumedNodeId?: string;
  resumedData?: any;
}

// --- Queue Abstraction ---
export class WorkerQueue {
  private bullQueue: Queue | null = null;
  private static instance: WorkerQueue;
  private inMemoryJobs: WorkflowJobData[] = [];

  private constructor() {
    if (USE_REDIS) {
      this.bullQueue = new Queue("workflow-queue", {
        connection: {
          url: REDIS_URL,
        },
      });
    }
  }

  public static getInstance(): WorkerQueue {
    if (!WorkerQueue.instance) {
      WorkerQueue.instance = new WorkerQueue();
    }
    return WorkerQueue.instance;
  }

  async addJob(data: WorkflowJobData) {
    if (USE_REDIS && this.bullQueue) {
      await this.bullQueue.add(data.type, data);
    } else {
      console.log(`📥 [In-Memory Queue] Enqueued job: ${data.type} for execution ${data.executionId}`);
      this.inMemoryJobs.push(data);
      // Process immediately (async)
      this.processInMemoryNext();
    }
  }

  private async processInMemoryNext() {
    const jobData = this.inMemoryJobs.shift();
    if (!jobData) return;

    try {
      await processWorkflowJob(jobData);
    } catch (e) {
      console.error(`Error processing in-memory job ${jobData.executionId}:`, e);
    }
  }
}

// --- Job Processing ---
async function processWorkflowJob(data: WorkflowJobData) {
  const { type, workspaceId, executionId, workflowId, triggerNodeId, triggerData, resumedNodeId, resumedData } = data;
  
  // Fetch active workflow version
  const { data: workflow } = await supabaseAdmin.from("Workflow")
    .select("*, versions:WorkflowVersion(*)")
    .eq("id", workflowId)
    .limit(1)
    .maybeSingle();

  if (workflow && workflow.versions) {
    workflow.versions.sort((a: any, b: any) => b.version - a.version);
    workflow.versions = workflow.versions.slice(0, 1);
  }

  if (!workflow || !workflow.versions || workflow.versions.length === 0) {
    console.error(`Workflow ${workflowId} or active version not found.`);
    await supabaseAdmin.from("Execution")
      .update({ status: "FAILED", finishedAt: new Date().toISOString() })
      .eq("id", executionId);
    return;
  }

  const activeVersion = workflow.versions[0];
  const nodes = activeVersion.nodes as any;
  const edges = activeVersion.edges as any;

  const executor = new WorkflowExecutor(workspaceId, executionId);

  if (type === "workflow.execute") {
    await executor.executeWorkflow(nodes, edges, triggerNodeId!, triggerData);
  } else if (type === "workflow.resume") {
    await executor.resumeWorkflow(nodes, edges, resumedNodeId!, resumedData);
  }
}

// --- Initialize BullMQ Worker (if using Redis) ---
if (USE_REDIS) {
  const worker = new Worker(
    "workflow-queue",
    async (job: Job) => {
      console.log(`📦 [BullMQ] Processing job ${job.id} | Type: ${job.name}`);
      await processWorkflowJob(job.data as WorkflowJobData);
    },
    {
      connection: {
        url: REDIS_URL,
      },
    }
  );

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
    const { data: schedulesDue } = await supabaseAdmin.from("Schedule")
      .select("*, workflow:Workflow!inner(*)")
      .lte("nextRun", now.toISOString())
      .eq("workflow.status", "ACTIVE");

    const schedulesList = schedulesDue || [];
    for (const schedule of schedulesList) {
      console.log(`⏰ Schedule triggered for workflow ${schedule.workflowId} (${schedule.workflow.title})`);

      // 1. Create an execution history entry
      const { data: execution, error: execError } = await supabaseAdmin.from("Execution")
        .insert({
          workflowId: schedule.workflowId,
          status: "RUNNING",
          triggerType: "schedule",
          triggerData: { scheduleId: schedule.id, cron: schedule.cron },
          startedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (execError) throw execError;

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
      await supabaseAdmin.from("Schedule")
        .update({
          nextRun: nextRunDate.toISOString(),
        })
        .eq("id", schedule.id);
      console.log(`📅 Updated next schedule run to: ${nextRunDate.toISOString()}`);
    }
  } catch (e) {
    console.error("Error polling schedules:", e);
  }
}

export function calculateNextRun(cronExpression: string, timezone: string = "Asia/Kolkata"): Date {
  try {
    const options = {
      currentDate: new Date(),
      tz: timezone,
    };
    const interval = cronParser.CronExpressionParser.parse(cronExpression, options);
    return interval.next().toDate();
  } catch (err) {
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
  const { data: nullSchedules } = await supabaseAdmin.from("Schedule")
    .select("*, workflow:Workflow!inner(*)")
    .is("nextRun", null)
    .eq("workflow.status", "ACTIVE");

  const schedulesList = nullSchedules || [];
  for (const schedule of schedulesList) {
    const nextRun = calculateNextRun(schedule.cron, schedule.timezone);
    await supabaseAdmin.from("Schedule")
      .update({ nextRun: nextRun.toISOString() })
      .eq("id", schedule.id);
    console.log(`🗓️ Configured initial schedule run for ${schedule.workflowId} to ${nextRun.toISOString()}`);
  }
}
initializeSchedules();
