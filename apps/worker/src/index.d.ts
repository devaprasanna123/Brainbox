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
export declare class WorkerQueue {
    private bullQueue;
    private static instance;
    private inMemoryJobs;
    private constructor();
    static getInstance(): WorkerQueue;
    addJob(data: WorkflowJobData): Promise<void>;
    private processInMemoryNext;
}
export declare function calculateNextRun(cronExpression: string, timezone?: string): Date;
export {};
