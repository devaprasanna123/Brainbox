import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";

// --- Firebase Admin SDK Initializer & Token Verification ---
let firebaseAdminApp: App | null = null;

export function getFirebaseAdmin(): App {
  if (!firebaseAdminApp) {
    const apps = getApps();
    if (apps.length > 0 && apps[0]) {
      firebaseAdminApp = apps[0];
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        : undefined;

      if (projectId && clientEmail && privateKey) {
        firebaseAdminApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } else if (projectId) {
        firebaseAdminApp = initializeApp({
          projectId,
        });
      } else {
        firebaseAdminApp = initializeApp();
      }
    }
  }
  return firebaseAdminApp;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdmin();
  return getAuth(app).verifyIdToken(idToken);
}

// --- Password Hashing ---
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- JWT Authentication ---
const JWT_SECRET = process.env.AUTH_SECRET || "fallback_jwt_secret_value_32_chars_long";

export interface TokenPayload {
  userId: string;
  email: string;
  workspaceId: string;
}

export function generateToken(payload: TokenPayload, expiresIn: string = "7d"): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as any });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// --- Credential Encryption & Decryption ---
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY || "default_brain_box_encryption_key_hash";
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypts a plaintext string (e.g. OAuth access token)
 */
export function encryptCredential(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypts an encrypted credential string
 */
export function decryptCredential(encryptedText: string): string {
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(":");
    const ivHex = parts.shift();
    if (!ivHex) {
      throw new Error("Missing IV initialization vector");
    }

    const iv = Buffer.from(ivHex, "hex");
    const ciphertext = parts.join(":");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error: any) {
    throw new Error(`Failed to decrypt credential: ${error.message}`);
  }
}
