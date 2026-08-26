"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirebaseAdmin = getFirebaseAdmin;
exports.verifyFirebaseIdToken = verifyFirebaseIdToken;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.encryptCredential = encryptCredential;
exports.decryptCredential = decryptCredential;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
// --- Firebase Admin SDK Initializer & Token Verification ---
let firebaseAdminApp = null;
function getFirebaseAdmin() {
    if (!firebaseAdminApp) {
        const apps = (0, app_1.getApps)();
        if (apps.length > 0 && apps[0]) {
            firebaseAdminApp = apps[0];
        }
        else {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY
                ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
                : undefined;
            if (projectId && clientEmail && privateKey) {
                firebaseAdminApp = (0, app_1.initializeApp)({
                    credential: (0, app_1.cert)({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                });
            }
            else if (projectId) {
                firebaseAdminApp = (0, app_1.initializeApp)({
                    projectId,
                });
            }
            else {
                firebaseAdminApp = (0, app_1.initializeApp)();
            }
        }
    }
    return firebaseAdminApp;
}
async function verifyFirebaseIdToken(idToken) {
    const app = getFirebaseAdmin();
    return (0, auth_1.getAuth)(app).verifyIdToken(idToken);
}
// --- Password Hashing ---
async function hashPassword(password) {
    const salt = await bcryptjs_1.default.genSalt(10);
    return bcryptjs_1.default.hash(password, salt);
}
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
// --- JWT Authentication ---
const JWT_SECRET = process.env.AUTH_SECRET || "fallback_jwt_secret_value_32_chars_long";
function generateToken(payload, expiresIn = "7d") {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: expiresIn });
}
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
// --- Credential Encryption & Decryption ---
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
function getEncryptionKey() {
    const rawKey = process.env.ENCRYPTION_KEY || "default_brain_box_encryption_key_hash";
    return crypto_1.default.createHash("sha256").update(rawKey).digest();
}
/**
 * Encrypts a plaintext string (e.g. OAuth access token)
 */
function encryptCredential(text) {
    const key = getEncryptionKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}
/**
 * Decrypts an encrypted credential string
 */
function decryptCredential(encryptedText) {
    try {
        const key = getEncryptionKey();
        const parts = encryptedText.split(":");
        const ivHex = parts.shift();
        if (!ivHex) {
            throw new Error("Missing IV initialization vector");
        }
        const iv = Buffer.from(ivHex, "hex");
        const ciphertext = parts.join(":");
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(ciphertext, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    }
    catch (error) {
        throw new Error(`Failed to decrypt credential: ${error.message}`);
    }
}
//# sourceMappingURL=index.js.map