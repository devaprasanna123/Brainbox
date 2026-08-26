import { App } from "firebase-admin/app";
import { DecodedIdToken } from "firebase-admin/auth";
export declare function getFirebaseAdmin(): App;
export declare function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken>;
export declare function hashPassword(password: string): Promise<string>;
export declare function comparePassword(password: string, hash: string): Promise<boolean>;
export interface TokenPayload {
    userId: string;
    email: string;
    workspaceId: string;
}
export declare function generateToken(payload: TokenPayload, expiresIn?: string): string;
export declare function verifyToken(token: string): TokenPayload;
/**
 * Encrypts a plaintext string (e.g. OAuth access token)
 */
export declare function encryptCredential(text: string): string;
/**
 * Decrypts an encrypted credential string
 */
export declare function decryptCredential(encryptedText: string): string;
