import { google } from "googleapis";
export { google };
export declare function safeLog(event: string, meta?: Record<string, unknown>): void;
export declare function generateOAuthState(userId: string, workspaceId: string): string;
export declare function consumeOAuthState(state: string): {
    userId: string;
    workspaceId: string;
};
export declare const REQUIRED_GOOGLE_SCOPES: string[];
export declare function getGoogleOAuth2Client(): import("google-auth-library").OAuth2Client;
export declare function validateOAuthConfiguration(): {
    configured: boolean;
    clientIdSuffix: string;
    redirectUri: string;
    projectId: string;
};
export declare function saveGoogleCredential(workspaceId: string, tokens: any, email?: string): Promise<any>;
export declare function getAuthorizedClient(id: string): Promise<import("google-auth-library").OAuth2Client>;
export interface GoogleServiceCapability {
    available: boolean;
    status: "READY" | "API_DISABLED" | "ERROR" | "PERMISSION_DENIED";
    errorCode?: string;
    message?: string;
}
export interface GoogleConnectionStatusResult {
    connected: boolean;
    oauthValid: boolean;
    status: "CONNECTED" | "API_DISABLED" | "OAUTH_REQUIRED" | "REAUTH_REQUIRED" | "PERMISSION_DENIED" | "TEMPORARY_ERROR";
    requiresReconnect: boolean;
    requiresApiEnablement: boolean;
    googleEmail?: string;
    email?: string;
    account: {
        status: "CONNECTED" | "REAUTH_REQUIRED" | "OAUTH_REQUIRED";
        email?: string;
    };
    gmail: GoogleServiceCapability;
    calendar: GoogleServiceCapability;
    drive: GoogleServiceCapability;
    sheets: GoogleServiceCapability;
    services?: {
        gmail: GoogleServiceCapability;
        calendar: GoogleServiceCapability;
        drive: GoogleServiceCapability;
        sheets: GoogleServiceCapability;
    };
    gmailScopeGranted: boolean;
    hasRefreshToken: boolean;
    accessTokenValid: boolean;
    grantedScopes?: string[];
    error?: string;
}
export declare function validateGoogleConnection(userId: string): Promise<GoogleConnectionStatusResult>;
export interface GoogleApiMappedError {
    success: false;
    provider: "google";
    service: string;
    errorCode: string;
    code: string;
    message: string;
    httpStatus?: number;
}
export declare function mapGoogleApiError(error: any, service?: string): GoogleApiMappedError;
export declare function mapGmailError(error: any): GoogleApiMappedError;
export declare class GmailProvider {
    private userId;
    constructor(userId: string);
    search(query: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        results: {
            id: string;
            threadId: string;
            from: string;
            to: string;
            subject: string;
            snippet: string;
            body: string;
            date: string;
        }[];
    }>;
    send(to: string, subject: string, body: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        messageId: string;
        threadId: string | null | undefined;
        to: string;
        subject: string;
        timestamp: string;
    }>;
    draft(to: string, subject: string, body: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        draftId: string | null | undefined;
        to: string;
    }>;
    sendEmail(to: string, subject: string, body: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        messageId: string;
        threadId: string | null | undefined;
        to: string;
        subject: string;
        timestamp: string;
    }>;
    listMessages(query?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        results: {
            id: string;
            threadId: string;
            from: string;
            to: string;
            subject: string;
            snippet: string;
            body: string;
            date: string;
        }[];
    }>;
    getMessage(messageId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        message: import("googleapis").gmail_v1.Schema$Message;
    }>;
    searchMessages(query: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        results: {
            id: string;
            threadId: string;
            from: string;
            to: string;
            subject: string;
            snippet: string;
            body: string;
            date: string;
        }[];
    }>;
    createDraft(to: string, subject: string, body: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        draftId: string | null | undefined;
        to: string;
    }>;
}
export declare class CalendarProvider {
    private userId;
    constructor(userId: string);
    list(timeRange?: string, userTimezone?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        events: {
            id: string;
            summary: string;
            description: string;
            start: string;
            end: string;
            htmlLink: string;
        }[];
    }>;
    create(title: string, startTime: string, durationMinutes?: number, description?: string, userTimezone?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        eventId: string;
        htmlLink: string;
        summary: string;
        start: string;
        end: string;
        timezone: string;
        timestamp: string;
    }>;
    update(eventId: string, updates: {
        title?: string;
        startTime?: string;
        durationMinutes?: number;
        description?: string;
    }): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        eventId: string;
    }>;
    delete(eventId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        eventId: string;
    }>;
    listEvents(timeRange?: string, userTimezone?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        events: {
            id: string;
            summary: string;
            description: string;
            start: string;
            end: string;
            htmlLink: string;
        }[];
    }>;
    createEvent(title: string, startTime: string, durationMinutes?: number, description?: string, userTimezone?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        eventId: string;
        htmlLink: string;
        summary: string;
        start: string;
        end: string;
        timezone: string;
        timestamp: string;
    }>;
    getEvent(eventId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        event: import("googleapis").calendar_v3.Schema$Event;
    }>;
    updateEvent(eventId: string, updates: any): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        eventId: string;
    }>;
    deleteEvent(eventId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        action: string;
        eventId: string;
    }>;
}
export declare class DriveProvider {
    private userId;
    constructor(userId: string);
    search(query: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        files: import("googleapis").drive_v3.Schema$File[];
    }>;
    list(pageSize?: number): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        files: import("googleapis").drive_v3.Schema$File[];
    }>;
    read(fileId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        name: string | null | undefined;
        content: string;
    }>;
    create(name: string, content?: string, mimeType?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        fileId: string | null | undefined;
        link: string | null | undefined;
    }>;
    update(fileId: string, content: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        fileId: string;
    }>;
    searchFiles(query: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        files: import("googleapis").drive_v3.Schema$File[];
    }>;
    getFile(fileId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        file: import("googleapis").drive_v3.Schema$File;
    }>;
    downloadFile(fileId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        name: string | null | undefined;
        content: string;
    }>;
    uploadFile(name: string, content: string, mimeType?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        fileId: string | null | undefined;
        link: string | null | undefined;
    }>;
    createFolder(name: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        fileId: string | null | undefined;
        link: string | null | undefined;
    }>;
    listFiles(pageSize?: number): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        files: import("googleapis").drive_v3.Schema$File[];
    }>;
}
export declare class SheetsProvider {
    private userId;
    constructor(userId: string);
    find(title: string): Promise<any>;
    readSheet(spreadsheetId: string, range?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        values: any[][];
    }>;
    appendRow(spreadsheetId: string, values: any[], range?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        updatedRange: string | null | undefined;
    }>;
    writeCell(spreadsheetId: string, range: string, values: any[][]): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        updatedCells: number | null | undefined;
    }>;
    readRange(spreadsheetId: string, range?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        values: any[][];
    }>;
    writeRange(spreadsheetId: string, range: string, values: any[][]): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        updatedCells: number | null | undefined;
    }>;
    appendRows(spreadsheetId: string, values: any[], range?: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        updatedRange: string | null | undefined;
    }>;
    createSpreadsheet(title: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        fileId: string | null | undefined;
        link: string | null | undefined;
    }>;
    getSpreadsheet(spreadsheetId: string): Promise<GoogleApiMappedError | {
        success: boolean;
        status: string;
        provider: string;
        service: string;
        spreadsheet: import("googleapis").sheets_v4.Schema$Spreadsheet;
    }>;
}
export declare class ActivepiecesService {
    private url;
    private apiKey;
    constructor();
    private isConfigured;
    listConnections(userId: string): Promise<{
        status: string;
        connections: any;
        error?: undefined;
    } | {
        status: string;
        error: {
            code: string;
            message: any;
        };
        connections?: undefined;
    }>;
    triggerFlow(flowId: string, payload: Record<string, any>): Promise<{
        status: string;
        runId: any;
        flowId: string;
        error?: undefined;
    } | {
        status: string;
        error: {
            code: string;
            message: any;
        };
        runId?: undefined;
        flowId?: undefined;
    }>;
    getRunStatus(runId: string): Promise<{
        status: string;
        runStatus: any;
        duration: any;
        error?: undefined;
    } | {
        status: string;
        error: {
            code: string;
            message: any;
        };
        runStatus?: undefined;
        duration?: undefined;
    }>;
    cancelRun(runId: string): Promise<{
        status: string;
        error?: undefined;
    } | {
        status: string;
        error: {
            code: string;
            message: any;
        };
    }>;
    validateConnection(connectionId: string): Promise<{
        status: string;
        valid: boolean;
        error?: undefined;
    } | {
        status: string;
        valid: boolean;
        error: {
            message: any;
        };
    }>;
}
export declare class MessagingProvider {
    static sendTelegram(message: string): Promise<{
        status: string;
        provider: string;
        error: {
            code: string;
            message: string;
        };
    } | {
        status: string;
        provider: string;
        error?: undefined;
    }>;
    static sendDiscord(message: string, customUrl?: string): Promise<{
        status: string;
        provider: string;
        error: {
            code: string;
            message: string;
        };
    } | {
        status: string;
        provider: string;
        error?: undefined;
    }>;
    static sendSlack(channel: string, message: string): Promise<{
        status: string;
        provider: string;
        error: {
            code: string;
            message: string;
        };
    } | {
        status: string;
        provider: string;
        error?: undefined;
    }>;
}
export declare function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
