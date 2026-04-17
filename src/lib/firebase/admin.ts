/**
 * DAYMAKER CONNECT — Firebase Admin SDK Configuration
 *
 * Server-side only. Used in API routes and server components.
 * Requires FIREBASE_ADMIN_* environment variables.
 */

import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const adminConfig = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  // Private key comes with escaped newlines from env
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(adminConfig as ServiceAccount),
    });

const adminDb = getFirestore(app);
const adminAuth = getAuth(app);

export { adminDb, adminAuth, adminConfig };
