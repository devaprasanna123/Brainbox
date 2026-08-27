"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingProvider = exports.ActivepiecesService = exports.SheetsProvider = exports.DriveProvider = exports.CalendarProvider = exports.GmailProvider = exports.REQUIRED_GOOGLE_SCOPES = exports.google = void 0;
exports.safeLog = safeLog;
exports.generateOAuthState = generateOAuthState;
exports.consumeOAuthState = consumeOAuthState;
exports.getGoogleOAuth2Client = getGoogleOAuth2Client;
exports.validateOAuthConfiguration = validateOAuthConfiguration;
exports.saveGoogleCredential = saveGoogleCredential;
exports.getAuthorizedClient = getAuthorizedClient;
exports.validateGoogleConnection = validateGoogleConnection;
exports.mapGoogleApiError = mapGoogleApiError;
exports.mapGmailError = mapGmailError;
exports.verifyWebhookSignature = verifyWebhookSignature;
const googleapis_1 = require("googleapis");
Object.defineProperty(exports, "google", { enumerable: true, get: function () { return googleapis_1.google; } });
const database_1 = require("@brain-box-ai/database");
const auth_1 = require("@brain-box-ai/auth");
const crypto_1 = __importDefault(require("crypto"));
// ============================================================
// STRUCTURED SAFE LOGGER (server-side only, never logs secrets)
// ============================================================
function safeLog(event, meta = {}) {
    // Deep sanitize meta to ensure no access_token, refresh_token, client_secret, code, authorization headers leak
    const sanitized = {};
    for (const [k, v] of Object.entries(meta)) {
        const keyLower = k.toLowerCase();
        if (keyLower.includes("secret") ||
            keyLower.includes("token") ||
            keyLower.includes("password") ||
            keyLower.includes("credential") ||
            keyLower.includes("auth_code") ||
            keyLower.includes("code") ||
            keyLower.includes("cookie")) {
            if (typeof v === "boolean") {
                sanitized[k] = v;
            }
            else if (v) {
                sanitized[k] = "[REDACTED]";
            }
        }
        else {
            sanitized[k] = v;
        }
    }
    console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...sanitized }));
}
// ============================================================
// OAUTH STATE STORE (server-side CSRF protection)
// ============================================================
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const OAUTH_STATE_SECRET = process.env.AUTH_SECRET || "fallback_oauth_secret_for_state_signing_only";
function generateOAuthState(userId, workspaceId) {
    const payload = { userId, workspaceId };
    const state = jsonwebtoken_1.default.sign(payload, OAUTH_STATE_SECRET, { expiresIn: "1h" });
    safeLog("GOOGLE_OAUTH_START", { userId, workspaceId });
    return state;
}
function consumeOAuthState(state) {
    if (!state)
        throw new Error("Missing OAuth state parameter.");
    try {
        const decoded = jsonwebtoken_1.default.verify(state, OAUTH_STATE_SECRET);
        return { userId: decoded.userId, workspaceId: decoded.workspaceId };
    }
    catch (err) {
        throw new Error("OAuth state has expired or is invalid. Please try connecting again.");
    }
}
// ============================================================
// GOOGLE OAUTH CLIENT & CONFIGURATION
// ============================================================
exports.REQUIRED_GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email",
];
function getGoogleOAuth2Client() {
    const baseUrl = process.env.API_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001");
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/integrations/google/callback`;
    return new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID || "", process.env.GOOGLE_CLIENT_SECRET || "", redirectUri);
}
function validateOAuthConfiguration() {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const baseUrl = process.env.API_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001");
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/integrations/google/callback`;
    const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || (clientId ? clientId.split("-")[0] : "412264053150");
    const suffix = clientId.length > 6 ? clientId.slice(-6) : "****";
    return {
        configured: !!(clientId && clientSecret),
        clientIdSuffix: `****${suffix}`,
        redirectUri,
        projectId,
    };
}
// ============================================================
// TOKEN MANAGEMENT & STORAGE
// ============================================================
async function saveGoogleCredential(workspaceId, tokens, email) {
    const { data: existing } = await database_1.supabaseAdmin
        .from("Credential")
        .select("id, encryptedData")
        .eq("workspaceId", workspaceId)
        .eq("type", "google")
        .maybeSingle();
    let existingTokenData = {};
    if (existing?.encryptedData) {
        try {
            existingTokenData = JSON.parse((0, auth_1.decryptCredential)(existing.encryptedData));
        }
        catch { }
    }
    // CRITICAL: Preserve existing refresh_token if new token response does not contain one!
    const refreshToken = tokens.refresh_token || existingTokenData.refresh_token || "";
    const tokenData = {
        ...existingTokenData,
        ...tokens,
        email: email || existingTokenData.email || "",
        refresh_token: refreshToken,
        scope: tokens.scope || existingTokenData.scope || "",
        updated_at: new Date().toISOString(),
    };
    if (!tokenData.refresh_token) {
        safeLog("GOOGLE_TOKEN_SAVE_WARNING", { workspaceId, reason: "No refresh token available" });
    }
    const encryptedData = (0, auth_1.encryptCredential)(JSON.stringify(tokenData));
    const credentialName = email
        ? `Google (${email})`
        : existingTokenData.email
            ? `Google (${existingTokenData.email})`
            : "Google Gmail & Calendar";
    if (existing) {
        await database_1.supabaseAdmin
            .from("Credential")
            .update({
            name: credentialName,
            encryptedData,
            updatedAt: new Date().toISOString(),
        })
            .eq("id", existing.id);
    }
    else {
        await database_1.supabaseAdmin.from("Credential").insert({
            workspaceId,
            type: "google",
            name: credentialName,
            encryptedData,
        });
    }
    safeLog("GOOGLE_OAUTH_CALLBACK", { workspaceId, email: email || existingTokenData.email, hasRefreshToken: !!refreshToken });
    return tokenData;
}
// In-flight refresh promise deduplication map to prevent race conditions during concurrent requests
const activeRefreshPromises = new Map();
async function getAuthorizedClient(id) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        safeLog("GOOGLE_API_ERROR", { code: "OAUTH_REQUIRED", message: "Google OAuth credentials not configured on server." });
        const err = new Error("Google OAuth credentials are not configured on the server.");
        err.code = "OAUTH_REQUIRED";
        throw err;
    }
    // Resolve workspaceId whether given a Firebase UID or a Workspace UUID
    let workspaceId = id;
    const { data: wu } = await database_1.supabaseAdmin
        .from("WorkspaceUser")
        .select("workspaceId")
        .eq("userId", id)
        .limit(1)
        .maybeSingle();
    if (wu) {
        workspaceId = wu.workspaceId;
    }
    let { data: credential } = await database_1.supabaseAdmin
        .from("Credential")
        .select("*")
        .eq("workspaceId", workspaceId)
        .eq("type", "google")
        .limit(1)
        .maybeSingle();
    if (!credential && workspaceId !== id) {
        const { data: fallbackCred } = await database_1.supabaseAdmin
            .from("Credential")
            .select("*")
            .eq("workspaceId", id)
            .eq("type", "google")
            .limit(1)
            .maybeSingle();
        if (fallbackCred) {
            credential = fallbackCred;
        }
    }
    if (!credential) {
        safeLog("GOOGLE_API_ERROR", { code: "GOOGLE_REAUTH_REQUIRED", message: "Google account is not connected." });
        const err = new Error("Google authorization needs to be reconnected.");
        err.code = "GOOGLE_REAUTH_REQUIRED";
        throw err;
    }
    let tokenData;
    try {
        tokenData = JSON.parse((0, auth_1.decryptCredential)(credential.encryptedData));
    }
    catch {
        safeLog("GOOGLE_API_ERROR", { code: "GOOGLE_REAUTH_REQUIRED", message: "Stored credential is corrupted." });
        const err = new Error("Google authorization needs to be reconnected.");
        err.code = "GOOGLE_REAUTH_REQUIRED";
        throw err;
    }
    const hasRefreshToken = !!tokenData.refresh_token;
    if (!hasRefreshToken) {
        safeLog("GOOGLE_API_ERROR", { code: "GOOGLE_REAUTH_REQUIRED", message: "No refresh token available." });
        const err = new Error("Google authorization needs to be reconnected.");
        err.code = "GOOGLE_REAUTH_REQUIRED";
        throw err;
    }
    const oauth2Client = getGoogleOAuth2Client();
    oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry_date: tokenData.expiry_date,
    });
    oauth2Client.on("tokens", async (tokens) => {
        if (tokens.refresh_token) {
            tokenData.refresh_token = tokens.refresh_token;
        }
        if (tokens.access_token) {
            tokenData.access_token = tokens.access_token;
        }
        if (tokens.expiry_date) {
            tokenData.expiry_date = tokens.expiry_date;
        }
        try {
            await database_1.supabaseAdmin
                .from("Credential")
                .update({
                encryptedData: (0, auth_1.encryptCredential)(JSON.stringify(tokenData)),
                updatedAt: new Date().toISOString(),
            })
                .eq("id", credential.id);
        }
        catch (saveErr) {
            safeLog("GOOGLE_TOKEN_UPDATE_FAILED", { error: saveErr.message });
        }
    });
    // Proactively refresh access token if expired or expiring within 60 seconds
    const isExpiredOrExpiring = !tokenData.expiry_date || tokenData.expiry_date < Date.now() + 60000;
    if (isExpiredOrExpiring) {
        const credId = credential.id;
        // Check if refresh is already in flight for this credential to prevent concurrent duplicate refreshes
        if (activeRefreshPromises.has(credId)) {
            await activeRefreshPromises.get(credId);
            return oauth2Client;
        }
        const refreshPromise = (async () => {
            safeLog("GOOGLE_TOKEN_REFRESH", { workspaceId, isExpired: true });
            try {
                const refreshed = await oauth2Client.refreshAccessToken();
                tokenData.access_token = refreshed.credentials.access_token;
                if (refreshed.credentials.expiry_date) {
                    tokenData.expiry_date = refreshed.credentials.expiry_date;
                }
                if (refreshed.credentials.refresh_token) {
                    tokenData.refresh_token = refreshed.credentials.refresh_token;
                }
                await database_1.supabaseAdmin
                    .from("Credential")
                    .update({
                    encryptedData: (0, auth_1.encryptCredential)(JSON.stringify(tokenData)),
                    updatedAt: new Date().toISOString(),
                })
                    .eq("id", credential.id);
                safeLog("GOOGLE_TOKEN_REFRESH", { workspaceId, success: true });
            }
            catch (refErr) {
                const mapped = mapGoogleApiError(refErr, "auth");
                safeLog("GOOGLE_API_ERROR", { code: mapped.code, message: mapped.message });
                if (mapped.code === "GOOGLE_REAUTH_REQUIRED" || (refErr.message && refErr.message.includes("invalid_grant"))) {
                    const err = new Error("Google authorization needs to be reconnected.");
                    err.code = "GOOGLE_REAUTH_REQUIRED";
                    throw err;
                }
                // If temporary network error, don't invalidate refresh token
                throw refErr;
            }
            finally {
                activeRefreshPromises.delete(credId);
            }
        })();
        activeRefreshPromises.set(credId, refreshPromise);
        await refreshPromise;
    }
    return oauth2Client;
}
async function validateGoogleConnection(userId) {
    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            const result = {
                connected: false,
                oauthValid: false,
                status: "OAUTH_REQUIRED",
                requiresReconnect: false,
                requiresApiEnablement: false,
                account: { status: "OAUTH_REQUIRED" },
                gmail: { available: false, status: "ERROR", message: "Google OAuth credentials are not configured on server." },
                calendar: { available: false, status: "ERROR", message: "Google OAuth credentials are not configured on server." },
                drive: { available: false, status: "ERROR", message: "Google OAuth credentials are not configured on server." },
                sheets: { available: false, status: "ERROR", message: "Google OAuth credentials are not configured on server." },
                gmailScopeGranted: false,
                hasRefreshToken: false,
                accessTokenValid: false,
                error: "Google OAuth credentials are not configured on the server."
            };
            result.services = { gmail: result.gmail, calendar: result.calendar, drive: result.drive, sheets: result.sheets };
            return result;
        }
        let workspaceId = userId;
        const { data: wu } = await database_1.supabaseAdmin
            .from("WorkspaceUser")
            .select("workspaceId")
            .eq("userId", userId)
            .limit(1)
            .maybeSingle();
        if (wu)
            workspaceId = wu.workspaceId;
        let { data: credential } = await database_1.supabaseAdmin
            .from("Credential")
            .select("*")
            .eq("workspaceId", workspaceId)
            .eq("type", "google")
            .limit(1)
            .maybeSingle();
        if (!credential && workspaceId !== userId) {
            const { data: fallbackCred } = await database_1.supabaseAdmin
                .from("Credential")
                .select("*")
                .eq("workspaceId", userId)
                .eq("type", "google")
                .limit(1)
                .maybeSingle();
            if (fallbackCred)
                credential = fallbackCred;
        }
        if (!credential) {
            const result = {
                connected: false,
                oauthValid: false,
                status: "OAUTH_REQUIRED",
                requiresReconnect: false,
                requiresApiEnablement: false,
                account: { status: "OAUTH_REQUIRED" },
                gmail: { available: false, status: "ERROR", message: "Google account not connected." },
                calendar: { available: false, status: "ERROR", message: "Google account not connected." },
                drive: { available: false, status: "ERROR", message: "Google account not connected." },
                sheets: { available: false, status: "ERROR", message: "Google account not connected." },
                gmailScopeGranted: false,
                hasRefreshToken: false,
                accessTokenValid: false,
            };
            result.services = { gmail: result.gmail, calendar: result.calendar, drive: result.drive, sheets: result.sheets };
            return result;
        }
        let tokenData = {};
        try {
            tokenData = JSON.parse((0, auth_1.decryptCredential)(credential.encryptedData));
        }
        catch {
            const result = {
                connected: false,
                oauthValid: false,
                status: "REAUTH_REQUIRED",
                requiresReconnect: true,
                requiresApiEnablement: false,
                account: { status: "REAUTH_REQUIRED" },
                gmail: { available: false, status: "ERROR", message: "Credential corrupted." },
                calendar: { available: false, status: "ERROR", message: "Credential corrupted." },
                drive: { available: false, status: "ERROR", message: "Credential corrupted." },
                sheets: { available: false, status: "ERROR", message: "Credential corrupted." },
                gmailScopeGranted: false,
                hasRefreshToken: false,
                accessTokenValid: false,
                error: "Stored credential is corrupted."
            };
            result.services = { gmail: result.gmail, calendar: result.calendar, drive: result.drive, sheets: result.sheets };
            return result;
        }
        const googleEmail = tokenData.email || undefined;
        const hasRefreshToken = !!tokenData.refresh_token;
        const scopesStr = String(tokenData.scope || tokenData.scopes || "");
        const grantedScopes = scopesStr.split(" ").filter(Boolean);
        const gmailScopeGranted = scopesStr.includes("gmail.send") || scopesStr.includes("mail.google.com");
        if (!hasRefreshToken) {
            const result = {
                connected: false,
                oauthValid: false,
                status: "REAUTH_REQUIRED",
                requiresReconnect: true,
                requiresApiEnablement: false,
                googleEmail,
                email: googleEmail,
                account: { status: "REAUTH_REQUIRED", email: googleEmail },
                gmail: { available: false, status: "ERROR", message: "Refresh token missing." },
                calendar: { available: false, status: "ERROR", message: "Refresh token missing." },
                drive: { available: false, status: "ERROR", message: "Refresh token missing." },
                sheets: { available: false, status: "ERROR", message: "Refresh token missing." },
                gmailScopeGranted,
                hasRefreshToken: false,
                accessTokenValid: false,
                grantedScopes,
                error: "Refresh token is missing. Please reconnect Google."
            };
            result.services = { gmail: result.gmail, calendar: result.calendar, drive: result.drive, sheets: result.sheets };
            return result;
        }
        // Ping live Google APIs independently
        let gmailCapability = { available: true, status: "READY" };
        let calendarCapability = { available: true, status: "READY" };
        let driveCapability = { available: true, status: "READY" };
        let sheetsCapability = { available: true, status: "READY" };
        let requiresApiEnablement = false;
        try {
            const auth = await getAuthorizedClient(userId);
            // 1. Test Gmail
            try {
                const gmail = googleapis_1.google.gmail({ version: "v1", auth });
                await gmail.users.getProfile({ userId: "me" });
            }
            catch (gErr) {
                const mapped = mapGoogleApiError(gErr, "gmail");
                if (mapped.code === "GOOGLE_API_DISABLED") {
                    gmailCapability = {
                        available: false,
                        status: "API_DISABLED",
                        errorCode: "API_DISABLED",
                        message: "Gmail API is not enabled for this Google Cloud project.",
                    };
                    requiresApiEnablement = true;
                }
                else if (mapped.code === "PERMISSION_DENIED") {
                    gmailCapability = {
                        available: false,
                        status: "PERMISSION_DENIED",
                        errorCode: "PERMISSION_DENIED",
                        message: "Gmail send/read scope is missing.",
                    };
                }
                else {
                    gmailCapability = {
                        available: false,
                        status: "ERROR",
                        errorCode: mapped.code,
                        message: mapped.message,
                    };
                }
            }
            // 2. Test Calendar
            try {
                const calendar = googleapis_1.google.calendar({ version: "v3", auth });
                await calendar.calendarList.get({ calendarId: "primary" });
            }
            catch (cErr) {
                const mapped = mapGoogleApiError(cErr, "calendar");
                if (mapped.code === "GOOGLE_API_DISABLED") {
                    calendarCapability = {
                        available: false,
                        status: "API_DISABLED",
                        errorCode: "API_DISABLED",
                        message: "Google Calendar API is not enabled for this Google Cloud project.",
                    };
                    requiresApiEnablement = true;
                }
                else if (mapped.code === "PERMISSION_DENIED") {
                    calendarCapability = {
                        available: false,
                        status: "PERMISSION_DENIED",
                        errorCode: "PERMISSION_DENIED",
                        message: "Calendar scope is missing.",
                    };
                }
                else {
                    calendarCapability = {
                        available: false,
                        status: "ERROR",
                        errorCode: mapped.code,
                        message: mapped.message,
                    };
                }
            }
            // The Google Account itself IS CONNECTED and OAuth IS VALID as long as tokens are valid!
            // Do NOT mark entire account disconnected just because one API (e.g. Calendar) is disabled.
            const statusValue = requiresApiEnablement
                ? "API_DISABLED"
                : "CONNECTED";
            const finalResult = {
                connected: true,
                oauthValid: true,
                status: statusValue,
                requiresReconnect: false,
                requiresApiEnablement,
                googleEmail,
                email: googleEmail,
                account: { status: "CONNECTED", email: googleEmail },
                gmail: gmailCapability,
                calendar: calendarCapability,
                drive: driveCapability,
                sheets: sheetsCapability,
                services: {
                    gmail: gmailCapability,
                    calendar: calendarCapability,
                    drive: driveCapability,
                    sheets: sheetsCapability,
                },
                gmailScopeGranted,
                hasRefreshToken: true,
                accessTokenValid: true,
                grantedScopes,
            };
            safeLog("GOOGLE_CONNECTION_STATUS", {
                userId,
                connected: true,
                oauthValid: true,
                gmailAvailable: gmailCapability.available,
                calendarAvailable: calendarCapability.available,
                requiresApiEnablement,
            });
            return finalResult;
        }
        catch (authErr) {
            const mapped = mapGoogleApiError(authErr);
            const isReauth = mapped.code === "GOOGLE_REAUTH_REQUIRED";
            const errCapability = { available: false, status: "ERROR", errorCode: mapped.code, message: mapped.message };
            const errorResult = {
                connected: !isReauth,
                oauthValid: !isReauth,
                status: isReauth ? "REAUTH_REQUIRED" : "TEMPORARY_ERROR",
                requiresReconnect: isReauth,
                requiresApiEnablement: false,
                googleEmail,
                email: googleEmail,
                account: { status: isReauth ? "REAUTH_REQUIRED" : "CONNECTED", email: googleEmail },
                gmail: errCapability,
                calendar: errCapability,
                drive: errCapability,
                sheets: errCapability,
                services: {
                    gmail: errCapability,
                    calendar: errCapability,
                    drive: errCapability,
                    sheets: errCapability,
                },
                gmailScopeGranted,
                hasRefreshToken: true,
                accessTokenValid: false,
                grantedScopes,
                error: mapped.message,
            };
            safeLog("GOOGLE_CONNECTION_STATUS", { userId, connected: errorResult.connected, status: errorResult.status, error: mapped.message });
            return errorResult;
        }
    }
    catch (err) {
        const errCapability = { available: false, status: "ERROR", message: err.message };
        const failResult = {
            connected: false,
            oauthValid: false,
            status: "REAUTH_REQUIRED",
            requiresReconnect: true,
            requiresApiEnablement: false,
            account: { status: "REAUTH_REQUIRED" },
            gmail: errCapability,
            calendar: errCapability,
            drive: errCapability,
            sheets: errCapability,
            services: {
                gmail: errCapability,
                calendar: errCapability,
                drive: errCapability,
                sheets: errCapability,
            },
            gmailScopeGranted: false,
            hasRefreshToken: false,
            accessTokenValid: false,
            error: err.message,
        };
        return failResult;
    }
}
function mapGoogleApiError(error, service = "google") {
    const msg = error?.message || (typeof error === "string" ? error : JSON.stringify(error || ""));
    const status = error?.status || error?.code || error?.response?.status || 0;
    safeLog("GOOGLE_API_ERROR", { service, status, errorSnippet: msg.slice(0, 200) });
    if (error?.code === "OAUTH_REQUIRED" || msg.includes("Google account not connected")) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "GOOGLE_REAUTH_REQUIRED",
            code: "GOOGLE_REAUTH_REQUIRED",
            message: "Google authorization needs to be reconnected.",
            httpStatus: 401,
        };
    }
    if (msg.includes("API has not been used") ||
        msg.includes("has not been enabled") ||
        msg.includes("disabled") ||
        msg.includes("API_DISABLED") ||
        (status === 403 && (msg.includes("Access Not Configured") || msg.includes("API")))) {
        const serviceName = service === "calendar" ? "Google Calendar" : service === "gmail" ? "Gmail" : service === "drive" ? "Google Drive" : service === "sheets" ? "Google Sheets" : "Google";
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "GOOGLE_API_DISABLED",
            code: "GOOGLE_API_DISABLED",
            message: `${serviceName} API is not enabled for this Google Cloud project. Please enable it in Google Cloud Console.`,
            httpStatus: 403,
        };
    }
    if (msg.includes("invalid_grant") ||
        msg.includes("Token has been expired") ||
        msg.includes("token has been revoked") ||
        msg.includes("Re-authorization required") ||
        msg.includes("refresh failed") ||
        msg.includes("reconnected") ||
        error?.code === "GOOGLE_REAUTH_REQUIRED" ||
        error?.code === "REAUTH_REQUIRED" ||
        status === 401) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "GOOGLE_REAUTH_REQUIRED",
            code: "GOOGLE_REAUTH_REQUIRED",
            message: "Google authorization has expired or was revoked. Please reconnect Google in Settings.",
            httpStatus: 401,
        };
    }
    if (msg.includes("redirect_uri_mismatch")) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "REDIRECT_URI_MISMATCH",
            code: "REDIRECT_URI_MISMATCH",
            message: "Google OAuth redirect URI mismatch. Please verify GOOGLE_REDIRECT_URI in your server environment.",
            httpStatus: 400,
        };
    }
    if (msg.includes("insufficient permission") ||
        msg.includes("insufficientPermissions") ||
        error?.code === "PERMISSION_DENIED" ||
        (status === 403 && !msg.includes("API"))) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "PERMISSION_DENIED",
            code: "PERMISSION_DENIED",
            message: `Required scope or permission for ${service} was not granted. Please reconnect Google with required scopes.`,
            httpStatus: 403,
        };
    }
    if (status === 400 || msg.includes("Invalid recipient") || msg.includes("badRequest")) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "INVALID_ARGUMENT",
            code: "INVALID_ARGUMENT",
            message: msg.length < 200 ? msg : `Invalid parameters provided for ${service} request.`,
            httpStatus: 400,
        };
    }
    if (status === 404 || msg.includes("notFound")) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "NOT_FOUND",
            code: "NOT_FOUND",
            message: `Requested ${service} resource was not found.`,
            httpStatus: 404,
        };
    }
    if (status === 429 || msg.includes("quotaExceeded") || msg.includes("rateLimitExceeded") || msg.toLowerCase().includes("quota")) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "RATE_LIMITED",
            code: "RATE_LIMITED",
            message: "Google API rate limit or quota exceeded. Please try again in a moment.",
            httpStatus: 429,
        };
    }
    if ((status >= 500 && status < 600) || msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET")) {
        return {
            success: false,
            provider: "google",
            service,
            errorCode: "TEMPORARY_ERROR",
            code: "TEMPORARY_ERROR",
            message: "Google service is currently experiencing technical issues. Please try again later.",
            httpStatus: 503,
        };
    }
    return {
        success: false,
        provider: "google",
        service,
        errorCode: "GOOGLE_ERROR",
        code: "GOOGLE_ERROR",
        message: error.message || `${service} action failed to complete.`,
        httpStatus: status || 500,
    };
}
function mapGmailError(error) {
    return mapGoogleApiError(error, "gmail");
}
// ============================================================
// GMAIL INTEGRATION PROVIDER
// ============================================================
class GmailProvider {
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    async search(query) {
        safeLog("GOOGLE_API_REQUEST", { service: "gmail", action: "search", query });
        try {
            const auth = await getAuthorizedClient(this.userId);
            const gmail = googleapis_1.google.gmail({ version: "v1", auth });
            const response = await gmail.users.messages.list({ userId: "me", q: query });
            const messages = response.data.messages || [];
            const detailedMessages = await Promise.all(messages.slice(0, 5).map(async (m) => {
                const msg = await gmail.users.messages.get({ userId: "me", id: m.id });
                const headers = msg.data.payload?.headers || [];
                const from = headers.find((h) => h.name === "From")?.value || "";
                const to = headers.find((h) => h.name === "To")?.value || "";
                const subject = headers.find((h) => h.name === "Subject")?.value || "";
                return {
                    id: msg.data.id,
                    threadId: msg.data.threadId,
                    from,
                    to,
                    subject,
                    snippet: msg.data.snippet || "",
                    body: msg.data.snippet || "",
                    date: new Date(parseInt(msg.data.internalDate || "0")).toISOString(),
                };
            }));
            safeLog("GOOGLE_API_SUCCESS", { service: "gmail", action: "search", count: detailedMessages.length });
            return {
                success: true,
                status: "success",
                provider: "google",
                service: "gmail",
                action: "search",
                results: detailedMessages,
            };
        }
        catch (err) {
            const mapped = mapGoogleApiError(err, "gmail");
            return mapped;
        }
    }
    async send(to, subject, body) {
        safeLog("GOOGLE_API_REQUEST", { service: "gmail", action: "send", to });
        if (!to || !to.includes("@")) {
            const mapped = {
                success: false,
                provider: "google",
                service: "gmail",
                errorCode: "INVALID_ARGUMENT",
                code: "INVALID_ARGUMENT",
                message: "Please provide a valid recipient email address.",
                httpStatus: 400,
            };
            safeLog("GMAIL_SEND_FAILED", { reason: "Invalid recipient email" });
            return mapped;
        }
        const finalSubject = subject && subject.trim().length > 0
            ? subject.trim()
            : (body && body.trim().length > 0 && body.length < 30 ? body.trim() : "Message from Brain Box AI");
        const finalBody = body || finalSubject;
        let attempts = 0;
        const maxAttempts = 2;
        while (attempts < maxAttempts) {
            attempts++;
            try {
                const auth = await getAuthorizedClient(this.userId);
                const gmail = googleapis_1.google.gmail({ version: "v1", auth });
                // Build valid RFC 2822 MIME message
                const utf8Subject = `=?utf-8?B?${Buffer.from(finalSubject).toString("base64")}?=`;
                const messageParts = [
                    `To: ${to}`,
                    "Content-Type: text/plain; charset=utf-8",
                    "MIME-Version: 1.0",
                    `Subject: ${utf8Subject}`,
                    "",
                    finalBody,
                ];
                const rawMessage = messageParts.join("\r\n");
                const encodedMessage = Buffer.from(rawMessage)
                    .toString("base64")
                    .replace(/\+/g, "-")
                    .replace(/\//g, "_")
                    .replace(/=+$/, "");
                const response = await gmail.users.messages.send({
                    userId: "me",
                    requestBody: { raw: encodedMessage },
                });
                const messageId = response.data.id;
                const threadId = response.data.threadId || messageId;
                if (!messageId) {
                    throw new Error("Gmail API accepted the request but did not return a message ID.");
                }
                safeLog("GMAIL_SEND_SUCCESS", { messageId, threadId, to });
                return {
                    success: true,
                    status: "sent",
                    provider: "google",
                    service: "gmail",
                    action: "send",
                    messageId,
                    threadId,
                    to,
                    subject: finalSubject,
                    timestamp: new Date().toISOString(),
                };
            }
            catch (err) {
                const mappedErr = mapGoogleApiError(err, "gmail");
                const isTransient = mappedErr.errorCode === "TEMPORARY_ERROR" || (err.status >= 500 && err.status < 600);
                if (isTransient && attempts < maxAttempts) {
                    safeLog("GOOGLE_API_REQUEST", { service: "gmail", action: "send_retry", attempt: attempts });
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }
                safeLog("GMAIL_SEND_FAILED", { errorCode: mappedErr.errorCode, message: mappedErr.message });
                return mappedErr;
            }
        }
        const fallbackErr = mapGoogleApiError(new Error("Google service is currently experiencing technical issues."), "gmail");
        safeLog("GMAIL_SEND_FAILED", { errorCode: fallbackErr.errorCode });
        return fallbackErr;
    }
    async draft(to, subject, body) {
        const finalSubject = subject || "Draft Message";
        try {
            const auth = await getAuthorizedClient(this.userId);
            const gmail = googleapis_1.google.gmail({ version: "v1", auth });
            const utf8Subject = `=?utf-8?B?${Buffer.from(finalSubject).toString("base64")}?=`;
            const messageParts = [
                `To: ${to}`,
                "Content-Type: text/plain; charset=utf-8",
                "MIME-Version: 1.0",
                `Subject: ${utf8Subject}`,
                "",
                body || "",
            ];
            const rawMessage = messageParts.join("\r\n");
            const encodedMessage = Buffer.from(rawMessage)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");
            const response = await gmail.users.drafts.create({
                userId: "me",
                requestBody: { message: { raw: encodedMessage } },
            });
            return {
                success: true,
                status: "success",
                provider: "google",
                service: "gmail",
                action: "draft",
                draftId: response.data.id,
                to,
            };
        }
        catch (err) {
            return mapGoogleApiError(err, "gmail");
        }
    }
    // Aliases
    async sendEmail(to, subject, body) { return this.send(to, subject, body); }
    async listMessages(query) { return this.search(query || ""); }
    async getMessage(messageId) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const gmail = googleapis_1.google.gmail({ version: "v1", auth });
            const msg = await gmail.users.messages.get({ userId: "me", id: messageId });
            return { success: true, status: "success", provider: "google", service: "gmail", message: msg.data };
        }
        catch (err) {
            return mapGoogleApiError(err, "gmail");
        }
    }
    async searchMessages(query) { return this.search(query); }
    async createDraft(to, subject, body) { return this.draft(to, subject, body); }
}
exports.GmailProvider = GmailProvider;
// ============================================================
// GOOGLE CALENDAR INTEGRATION PROVIDER
// ============================================================
class CalendarProvider {
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    async list(timeRange = "today", userTimezone = "Asia/Kolkata") {
        safeLog("GOOGLE_API_REQUEST", { service: "calendar", action: "list", timeRange, timezone: userTimezone });
        try {
            const auth = await getAuthorizedClient(this.userId);
            const calendar = googleapis_1.google.calendar({ version: "v3", auth });
            const timeMin = new Date().toISOString();
            const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const response = await calendar.events.list({
                calendarId: "primary",
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: "startTime",
                timeZone: userTimezone || "Asia/Kolkata",
            });
            const items = response.data.items || [];
            safeLog("GOOGLE_API_SUCCESS", { service: "calendar", action: "list", count: items.length });
            return {
                success: true,
                status: "success",
                provider: "google",
                service: "calendar",
                action: "list",
                events: items.map((item) => ({
                    id: item.id,
                    summary: item.summary || "No Title",
                    description: item.description || "",
                    start: item.start?.dateTime || item.start?.date || "",
                    end: item.end?.dateTime || item.end?.date || "",
                    htmlLink: item.htmlLink || "",
                })),
            };
        }
        catch (err) {
            return mapGoogleApiError(err, "calendar");
        }
    }
    async create(title, startTime, durationMinutes = 30, description, userTimezone = "Asia/Kolkata") {
        safeLog("GOOGLE_API_REQUEST", { service: "calendar", action: "create", title, startTime, timezone: userTimezone });
        try {
            const auth = await getAuthorizedClient(this.userId);
            const calendar = googleapis_1.google.calendar({ version: "v3", auth });
            let startISO = startTime;
            if (!startTime.includes("T")) {
                startISO = new Date(startTime).toISOString();
            }
            else if (startTime.endsWith("Z")) {
                // AI generated a UTC time explicitly
            }
            else if (!startTime.includes("+") && !startTime.includes("-", 11)) {
                // AI generated a local time without offset (e.g., YYYY-MM-DDTHH:MM:SS)
                // We pass it directly to Google Calendar, which uses the timeZone field
            }
            const startMs = new Date(startISO).getTime();
            const endMs = startMs + durationMinutes * 60000;
            const endISO = new Date(endMs).toISOString(); // End time offset doesn't strictly matter if we just use the ms offset, but it's safer to format the same way.
            // Actually, if startISO lacks an offset, new Date(startISO) assumes local time on Vercel (UTC).
            // So let's build end time by modifying the string or just use Date object.
            // A better approach is to let Google Calendar handle the `timeZone`.
            const startDateTimeObj = { dateTime: startISO, timeZone: userTimezone };
            const endDateTimeObj = { dateTime: new Date(new Date(startISO).getTime() + durationMinutes * 60000).toISOString(), timeZone: userTimezone };
            if (!startISO.includes("Z") && !startISO.includes("+") && !startISO.includes("-", 11)) {
                const endD = new Date(new Date(startISO + "Z").getTime() + durationMinutes * 60000);
                endDateTimeObj.dateTime = endD.toISOString().replace(".000Z", "").replace("Z", "");
            }
            const event = await calendar.events.insert({
                calendarId: "primary",
                requestBody: {
                    summary: title,
                    description: description || `Created by Brain Box AI (${title})`,
                    start: startDateTimeObj,
                    end: endDateTimeObj,
                },
            });
            const eventId = event.data.id;
            if (!eventId) {
                throw new Error("Google Calendar API did not return an event ID.");
            }
            let htmlLink = event.data.htmlLink || `https://calendar.google.com/calendar/u/0/r/eventedit/${eventId}`;
            safeLog("CALENDAR_CREATE_SUCCESS", { eventId, title, htmlLink, startTime: startISO, timezone: userTimezone });
            return {
                success: true,
                status: "success",
                provider: "google",
                service: "calendar",
                action: "create",
                eventId,
                htmlLink,
                summary: title,
                start: startISO,
                end: endISO,
                timezone: userTimezone,
                timestamp: new Date().toISOString(),
            };
        }
        catch (err) {
            const mapped = mapGoogleApiError(err, "calendar");
            safeLog("CALENDAR_CREATE_FAILED", { errorCode: mapped.errorCode, message: mapped.message });
            return mapped;
        }
    }
    async update(eventId, updates) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const calendar = googleapis_1.google.calendar({ version: "v3", auth });
            const requestBody = {};
            if (updates.title)
                requestBody.summary = updates.title;
            if (updates.description !== undefined)
                requestBody.description = updates.description;
            if (updates.startTime) {
                const start = new Date(updates.startTime);
                const duration = updates.durationMinutes || 30;
                const end = new Date(start.getTime() + duration * 60000);
                requestBody.start = { dateTime: start.toISOString() };
                requestBody.end = { dateTime: end.toISOString() };
            }
            const res = await calendar.events.patch({
                calendarId: "primary",
                eventId,
                requestBody,
            });
            return {
                success: true,
                status: "success",
                provider: "google",
                service: "calendar",
                action: "update",
                eventId: res.data.id,
            };
        }
        catch (err) {
            return mapGoogleApiError(err, "calendar");
        }
    }
    async delete(eventId) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const calendar = googleapis_1.google.calendar({ version: "v3", auth });
            await calendar.events.delete({ calendarId: "primary", eventId });
            return {
                success: true,
                status: "success",
                provider: "google",
                service: "calendar",
                action: "delete",
                eventId,
            };
        }
        catch (err) {
            return mapGoogleApiError(err, "calendar");
        }
    }
    // Aliases
    async listEvents(timeRange, userTimezone) { return this.list(timeRange, userTimezone); }
    async createEvent(title, startTime, durationMinutes, description, userTimezone) {
        return this.create(title, startTime, durationMinutes, description, userTimezone);
    }
    async getEvent(eventId) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const calendar = googleapis_1.google.calendar({ version: "v3", auth });
            const res = await calendar.events.get({ calendarId: "primary", eventId });
            return { success: true, status: "success", provider: "google", service: "calendar", action: "get", event: res.data };
        }
        catch (err) {
            return mapGoogleApiError(err, "calendar");
        }
    }
    async updateEvent(eventId, updates) { return this.update(eventId, updates); }
    async deleteEvent(eventId) { return this.delete(eventId); }
}
exports.CalendarProvider = CalendarProvider;
// ============================================================
// GOOGLE DRIVE INTEGRATION PROVIDER
// ============================================================
class DriveProvider {
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    async search(query) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const drive = googleapis_1.google.drive({ version: "v3", auth });
            const q = query ? `name contains '${query}' and trashed = false` : "trashed = false";
            const res = await drive.files.list({
                q,
                fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
            });
            return { success: true, status: "success", provider: "google", service: "drive", files: res.data.files || [] };
        }
        catch (err) {
            return mapGoogleApiError(err, "drive");
        }
    }
    async list(pageSize = 10) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const drive = googleapis_1.google.drive({ version: "v3", auth });
            const res = await drive.files.list({
                pageSize,
                q: "trashed = false",
                fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
            });
            return { success: true, status: "success", provider: "google", service: "drive", files: res.data.files || [] };
        }
        catch (err) {
            return mapGoogleApiError(err, "drive");
        }
    }
    async read(fileId) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const drive = googleapis_1.google.drive({ version: "v3", auth });
            const metadata = await drive.files.get({ fileId, fields: "id, name, mimeType" });
            const mimeType = metadata.data.mimeType || "";
            let content = "";
            if (mimeType.includes("vnd.google-apps.document")) {
                const docRes = await drive.files.export({ fileId, mimeType: "text/plain" });
                content = typeof docRes.data === "string" ? docRes.data : JSON.stringify(docRes.data);
            }
            else {
                const fileRes = await drive.files.get({ fileId, alt: "media" });
                content = typeof fileRes.data === "string" ? fileRes.data : JSON.stringify(fileRes.data);
            }
            return { success: true, status: "success", provider: "google", service: "drive", name: metadata.data.name, content };
        }
        catch (err) {
            return mapGoogleApiError(err, "drive");
        }
    }
    async create(name, content = "", mimeType = "text/plain") {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const drive = googleapis_1.google.drive({ version: "v3", auth });
            const res = await drive.files.create({
                requestBody: {
                    name,
                    mimeType: mimeType.startsWith("application/vnd.google-apps") ? mimeType : "text/plain",
                },
                media: mimeType.startsWith("application/vnd.google-apps")
                    ? undefined
                    : { mimeType: "text/plain", body: content },
                fields: "id, name, webViewLink",
            });
            return { success: true, status: "success", provider: "google", service: "drive", fileId: res.data.id, link: res.data.webViewLink };
        }
        catch (err) {
            return mapGoogleApiError(err, "drive");
        }
    }
    async update(fileId, content) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const drive = googleapis_1.google.drive({ version: "v3", auth });
            await drive.files.update({
                fileId,
                media: { mimeType: "text/plain", body: content },
            });
            return { success: true, status: "success", provider: "google", service: "drive", fileId };
        }
        catch (err) {
            return mapGoogleApiError(err, "drive");
        }
    }
    // Aliases
    async searchFiles(query) { return this.search(query); }
    async getFile(fileId) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const drive = googleapis_1.google.drive({ version: "v3", auth });
            const res = await drive.files.get({ fileId, fields: "id, name, mimeType, size, modifiedTime" });
            return { success: true, status: "success", provider: "google", service: "drive", file: res.data };
        }
        catch (err) {
            return mapGoogleApiError(err, "drive");
        }
    }
    async downloadFile(fileId) { return this.read(fileId); }
    async uploadFile(name, content, mimeType) { return this.create(name, content, mimeType); }
    async createFolder(name) { return this.create(name, "", "application/vnd.google-apps.folder"); }
    async listFiles(pageSize) { return this.list(pageSize); }
}
exports.DriveProvider = DriveProvider;
// ============================================================
// GOOGLE SHEETS INTEGRATION PROVIDER
// ============================================================
class SheetsProvider {
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    async find(title) {
        const drive = new DriveProvider(this.userId);
        const result = await drive.search(title);
        if (!result.success && result.status !== "success")
            return result;
        const sheets = (result.files || []).filter((f) => f.mimeType === "application/vnd.google-apps.spreadsheet");
        return { success: true, status: "success", provider: "google", service: "sheets", spreadsheets: sheets };
    }
    async readSheet(spreadsheetId, range = "A1:Z100") {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const sheets = googleapis_1.google.sheets({ version: "v4", auth });
            const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
            return { success: true, status: "success", provider: "google", service: "sheets", values: res.data.values || [] };
        }
        catch (err) {
            return mapGoogleApiError(err, "sheets");
        }
    }
    async appendRow(spreadsheetId, values, range = "A1") {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const sheets = googleapis_1.google.sheets({ version: "v4", auth });
            const res = await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [values] },
            });
            return { success: true, status: "success", provider: "google", service: "sheets", updatedRange: res.data.updates?.updatedRange };
        }
        catch (err) {
            return mapGoogleApiError(err, "sheets");
        }
    }
    async writeCell(spreadsheetId, range, values) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const sheets = googleapis_1.google.sheets({ version: "v4", auth });
            const res = await sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: "USER_ENTERED",
                requestBody: { values },
            });
            return { success: true, status: "success", provider: "google", service: "sheets", updatedCells: res.data.updatedCells };
        }
        catch (err) {
            return mapGoogleApiError(err, "sheets");
        }
    }
    // Aliases
    async readRange(spreadsheetId, range) { return this.readSheet(spreadsheetId, range); }
    async writeRange(spreadsheetId, range, values) { return this.writeCell(spreadsheetId, range, values); }
    async appendRows(spreadsheetId, values, range) { return this.appendRow(spreadsheetId, values, range); }
    async createSpreadsheet(title) {
        const drive = new DriveProvider(this.userId);
        return drive.create(title, "", "application/vnd.google-apps.spreadsheet");
    }
    async getSpreadsheet(spreadsheetId) {
        try {
            const auth = await getAuthorizedClient(this.userId);
            const sheets = googleapis_1.google.sheets({ version: "v4", auth });
            const res = await sheets.spreadsheets.get({ spreadsheetId });
            return { success: true, status: "success", provider: "google", service: "sheets", spreadsheet: res.data };
        }
        catch (err) {
            return mapGoogleApiError(err, "sheets");
        }
    }
}
exports.SheetsProvider = SheetsProvider;
// ============================================================
// ACTIVEPIECES SERVICE ABSTRACTION
// ============================================================
class ActivepiecesService {
    url;
    apiKey;
    constructor() {
        this.url = process.env.ACTIVEPIECES_URL || "";
        this.apiKey = process.env.ACTIVEPIECES_API_KEY || "";
    }
    isConfigured() {
        return Boolean(this.url && this.apiKey);
    }
    async listConnections(userId) {
        if (!this.isConfigured()) {
            return { status: "failed", error: { code: "ACTIVEPIECES_NOT_CONFIGURED", message: "Activepieces is not configured." } };
        }
        try {
            const res = await fetch(`${this.url}/api/v1/app-connections`, {
                headers: { Authorization: `Bearer ${this.apiKey}` },
            });
            if (!res.ok)
                throw new Error(`Activepieces request failed: ${res.statusText}`);
            const data = await res.json();
            return { status: "success", connections: data.data || [] };
        }
        catch (err) {
            return {
                status: "failed",
                error: { code: "ACTIVEPIECES_ERROR", message: err.message || "Failed to list Activepieces connections." },
            };
        }
    }
    async triggerFlow(flowId, payload) {
        if (!this.isConfigured()) {
            return { status: "failed", error: { code: "ACTIVEPIECES_NOT_CONFIGURED", message: "Activepieces is not configured." } };
        }
        try {
            const res = await fetch(`${this.url}/api/v1/webhooks/${flowId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok)
                throw new Error(`Activepieces flow trigger failed: ${res.statusText}`);
            const data = await res.json();
            return { status: "success", runId: data.runId || data.id, flowId };
        }
        catch (err) {
            return {
                status: "failed",
                error: { code: "ACTIVEPIECES_TRIGGER_FAILED", message: err.message || "Failed to trigger Activepieces flow." },
            };
        }
    }
    async getRunStatus(runId) {
        if (!this.isConfigured()) {
            return { status: "failed", error: { code: "ACTIVEPIECES_NOT_CONFIGURED", message: "Activepieces is not configured." } };
        }
        try {
            const res = await fetch(`${this.url}/api/v1/flow-runs/${runId}`, {
                headers: { Authorization: `Bearer ${this.apiKey}` },
            });
            if (!res.ok)
                throw new Error(`Failed to fetch run status: ${res.statusText}`);
            const data = await res.json();
            return { status: "success", runStatus: data.status, duration: data.duration };
        }
        catch (err) {
            return {
                status: "failed",
                error: { code: "ACTIVEPIECES_STATUS_FAILED", message: err.message || "Failed to get run status." },
            };
        }
    }
    async cancelRun(runId) {
        if (!this.isConfigured()) {
            return { status: "failed", error: { code: "ACTIVEPIECES_NOT_CONFIGURED", message: "Activepieces is not configured." } };
        }
        try {
            const res = await fetch(`${this.url}/api/v1/flow-runs/${runId}/cancel`, {
                method: "POST",
                headers: { Authorization: `Bearer ${this.apiKey}` },
            });
            if (!res.ok)
                throw new Error(`Failed to cancel run: ${res.statusText}`);
            return { status: "success" };
        }
        catch (err) {
            return {
                status: "failed",
                error: { code: "ACTIVEPIECES_CANCEL_FAILED", message: err.message || "Failed to cancel Activepieces run." },
            };
        }
    }
    async validateConnection(connectionId) {
        if (!this.isConfigured()) {
            return { status: "failed", valid: false, error: { message: "Activepieces not configured." } };
        }
        try {
            const res = await fetch(`${this.url}/api/v1/app-connections/${connectionId}`, {
                headers: { Authorization: `Bearer ${this.apiKey}` },
            });
            return { status: "success", valid: res.ok };
        }
        catch (err) {
            return { status: "failed", valid: false, error: { message: err.message } };
        }
    }
}
exports.ActivepiecesService = ActivepiecesService;
// ============================================================
// MESSAGING PROVIDERS (Telegram / Discord / Slack)
// ============================================================
class MessagingProvider {
    static async sendTelegram(message) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            return { status: "failed", provider: "telegram", error: { code: "TELEGRAM_NOT_CONFIGURED", message: "Telegram bot token is not configured." } };
        }
        const chatId = "user-chat-id";
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: message }),
        });
        if (!res.ok) {
            return {
                status: "failed",
                provider: "telegram",
                error: { code: "TELEGRAM_SEND_FAILED", message: "Failed to send Telegram message." },
            };
        }
        return { status: "success", provider: "telegram" };
    }
    static async sendDiscord(message, customUrl) {
        const webhookUrl = customUrl || process.env.DISCORD_BOT_TOKEN;
        if (!webhookUrl) {
            return { status: "failed", provider: "discord", error: { code: "DISCORD_NOT_CONFIGURED", message: "Discord webhook URL is not configured." } };
        }
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: message }),
        });
        if (!res.ok) {
            return {
                status: "failed",
                provider: "discord",
                error: { code: "DISCORD_SEND_FAILED", message: "Failed to send Discord message." },
            };
        }
        return { status: "success", provider: "discord" };
    }
    static async sendSlack(channel, message) {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) {
            return { status: "failed", provider: "slack", error: { code: "SLACK_NOT_CONFIGURED", message: "Slack bot token is not configured." } };
        }
        const res = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel, text: message }),
        });
        if (!res.ok) {
            return {
                status: "failed",
                provider: "slack",
                error: { code: "SLACK_SEND_FAILED", message: "Failed to send Slack message." },
            };
        }
        return { status: "success", provider: "slack" };
    }
}
exports.MessagingProvider = MessagingProvider;
// ============================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================
function verifyWebhookSignature(payload, signature, secret) {
    if (!signature || !secret)
        return false;
    try {
        const computed = crypto_1.default.createHmac("sha256", secret).update(payload).digest("hex");
        return crypto_1.default.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(signature, "hex"));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=index.js.map