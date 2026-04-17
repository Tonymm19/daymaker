/**
 * DAYMAKER CONNECT — Firebase Client SDK Configuration
 *
 * Initializes the Firebase client app for browser-side usage.
 * Requires NEXT_PUBLIC_FIREBASE_* environment variables.
 *
 * Gracefully handles missing env vars — Firebase features will
 * be unavailable but the UI won't crash.
 */

import { initializeApp, getApps, getApp as firebaseGetApp, type FirebaseApp } from 'firebase/app';
import { getAuth as firebaseGetAuth, type Auth } from 'firebase/auth';
import { getFirestore as firebaseGetFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Whether Firebase env vars are configured */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  try {
    return getApps().length ? firebaseGetApp() : initializeApp(firebaseConfig);
  } catch {
    console.warn('[Daymaker] Firebase app initialization failed');
    return null;
  }
}

// Lazy-initialized singletons — safe for SSR and missing env vars
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getAuth(): Auth | null {
  if (!_auth) {
    const app = getFirebaseApp();
    if (!app) return null;
    try {
      _auth = firebaseGetAuth(app);
    } catch {
      console.warn('[Daymaker] Firebase Auth initialization failed');
      return null;
    }
  }
  return _auth;
}

function getDb(): Firestore | null {
  if (!_db) {
    const app = getFirebaseApp();
    if (!app) return null;
    try {
      _db = firebaseGetFirestore(app);
    } catch {
      console.warn('[Daymaker] Firestore initialization failed');
      return null;
    }
  }
  return _db;
}

export { firebaseConfig, getAuth, getDb };
