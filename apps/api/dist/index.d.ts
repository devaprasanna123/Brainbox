import express, { Request, Response, NextFunction } from "express";
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email: string;
        workspaceId: string;
    };
}
export declare function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<express.Response<any, Record<string, any>> | undefined>;
