/**
 * DAYMAKER CONNECT — Firebase Auth Helpers
 *
 * Client-side authentication utilities.
 * Wraps Firebase Auth SDK methods with typed interfaces.
 *
 * Gracefully handles missing Firebase config — all functions
 * return error results when Firebase is not configured.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, getDb, isFirebaseConfigured } from './config';

export interface AuthError {
  code: string;
  message: string;
}

const NOT_CONFIGURED_ERROR: AuthError = {
  code: 'not-configured',
  message: 'Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* env vars to .env.local',
};

export async function ensureUserDocument(uid: string, email: string | null, displayName: string | null) {
  const db = getDb();
  if (!db) return;
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) {
    const defaultUser = {
      uid,
      email: email || '',
      displayName: displayName || '',
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      linkedInImportedAt: null,
      contactCount: 0,
      northStar: '',
      rmConnected: false,
      rmPersonaTraits: [],
      currentMonthQueries: 0,
      currentMonthEvents: 0,
      currentMonthString: new Date().toISOString().substring(0, 7),
      googleCalendarConnected: false,
      googleCalendarAccessToken: null,
      googleCalendarRefreshToken: null,
      microsoftCalendarConnected: false,
      microsoftCalendarAccessToken: null,
      microsoftCalendarRefreshToken: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, defaultUser);
  }
}

/**
 * Sign up a new user with email and password.
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string
): Promise<{ success: boolean; error?: AuthError }> {
  const auth = getAuth();
  if (!auth) return { success: false, error: NOT_CONFIGURED_ERROR };
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    await ensureUserDocument(credential.user.uid, email, displayName);
    return { success: true };
  } catch (error: unknown) {
    const authError = error as AuthError;
    return { success: false, error: authError };
  }
}

/**
 * Sign in with email and password.
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ success: boolean; error?: AuthError }> {
  const auth = getAuth();
  if (!auth) return { success: false, error: NOT_CONFIGURED_ERROR };
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (error: unknown) {
    const authError = error as AuthError;
    return { success: false, error: authError };
  }
}

/**
 * Sign in with Google OAuth popup.
 */
export async function signInWithGoogle(): Promise<{
  success: boolean;
  error?: AuthError;
}> {
  const auth = getAuth();
  if (!auth) return { success: false, error: NOT_CONFIGURED_ERROR };
  try {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    await ensureUserDocument(credential.user.uid, credential.user.email, credential.user.displayName);
    return { success: true };
  } catch (error: unknown) {
    const authError = error as AuthError;
    return { success: false, error: authError };
  }
}

/**
 * Send a password reset email to the given address.
 * Firebase will send the email even if the address is not registered,
 * for privacy reasons. The action link in the email points back to the
 * `/auth/action` route configured in Firebase Console.
 */
export async function sendPasswordReset(
  email: string
): Promise<{ success: boolean; error?: AuthError }> {
  const auth = getAuth();
  if (!auth) return { success: false, error: NOT_CONFIGURED_ERROR };
  try {
    await firebaseSendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error: unknown) {
    const authError = error as AuthError;
    return { success: false, error: authError };
  }
}

/**
 * Verify a password reset code from a Firebase action link.
 * Returns the email associated with the code if valid.
 */
export async function verifyResetCode(
  oobCode: string
): Promise<{ success: boolean; email?: string; error?: AuthError }> {
  const auth = getAuth();
  if (!auth) return { success: false, error: NOT_CONFIGURED_ERROR };
  try {
    const email = await firebaseVerifyPasswordResetCode(auth, oobCode);
    return { success: true, email };
  } catch (error: unknown) {
    const authError = error as AuthError;
    return { success: false, error: authError };
  }
}

/**
 * Complete a password reset using the action code and a new password.
 */
export async function confirmReset(
  oobCode: string,
  newPassword: string
): Promise<{ success: boolean; error?: AuthError }> {
  const auth = getAuth();
  if (!auth) return { success: false, error: NOT_CONFIGURED_ERROR };
  try {
    await firebaseConfirmPasswordReset(auth, oobCode, newPassword);
    return { success: true };
  } catch (error: unknown) {
    const authError = error as AuthError;
    return { success: false, error: authError };
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  const auth = getAuth();
  if (auth) await firebaseSignOut(auth);
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 *
 * When Firebase is not configured, immediately calls back with null
 * (unauthenticated) so the UI doesn't hang on loading forever.
 */
export function onAuthStateChanged(
  callback: (user: { uid: string; email: string | null; displayName: string | null } | null) => void
): () => void {
  const auth = getAuth();
  if (!auth) {
    // Not configured — immediately report no user
    if (typeof window !== 'undefined') {
      setTimeout(() => callback(null), 0);
    }
    return () => {};
  }
  return firebaseOnAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      callback({ uid: user.uid, email: user.email, displayName: user.displayName });
    } else {
      callback(null);
    }
  });
}
