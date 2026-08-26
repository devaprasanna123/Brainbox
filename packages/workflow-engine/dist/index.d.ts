import { WorkflowNode, WorkflowEdge } from "@brain-box-ai/shared";
export interface ExecutionContext {
    executionId: string;
    workspaceId: string;
    outputs: Record<string, any>;
}
export declare function interpolate(templateStr: string, context: Record<string, any>): string;
export declare function resolveParams(data: Record<string, any>, context: Record<string, any>): Record<string, any>;
export declare class WorkflowExecutor {
    private workspaceId;
    private executionId;
    private nodes;
    private edges;
    private outputs;
    constructor(workspaceId: string, executionId: string);
    executeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], triggerNodeId: string, triggerData?: any): Promise<void>;
    /**
     * Resume execution from a specific node (e.g. after approval or delay)
     */
    resumeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], resumedNodeId: string, inputData: any): Promise<void>;
    private getNextNodes;
    private executeNode;
}
