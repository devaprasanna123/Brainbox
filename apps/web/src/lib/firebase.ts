import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyKeyForBuildTimePrerender",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dummy-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const isFirebaseConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
};

export const getFirebaseApp = (): FirebaseApp => {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
};

export const getFirebaseAuth = (): Auth => {
  return getAuth(getFirebaseApp());
};

export const app = getFirebaseApp();
export const auth = getFirebaseAuth();
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, firebaseSignOut, onAuthStateChanged };
export type { User };
