import express, { Request, Response, NextFunction } from "express";
declare const app: import("express-serve-static-core").Express;
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email: string;
        workspaceId: string;
    };
}
export declare function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<express.Response<any, Record<string, any>> | undefined>;
export default app;
