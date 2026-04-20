/**
 * DAYMAKER CONNECT — Account Deletion
 *
 * POST /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated
 * data. Runs in this order, so that any partial failure leaves behind only
 * orphaned user data (not a zombie auth user with no data):
 *
 *   1. Subcollections: contacts, events, deepdives
 *   2. User doc (/users/{uid})
 *   3. Firebase Auth user
 *
 * Firestore has no recursive delete on admin-node, so we paginate each
 * subcollection in batches of 500 (the Firestore batch-write limit).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUBCOLLECTIONS = ['contacts', 'events', 'deepdives'];
const BATCH_SIZE = 500;

async function deleteCollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snap = await db.collection(collectionPath).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < BATCH_SIZE) break;
  }
  return totalDeleted;
}

export async function POST(request: Request) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const userRef = adminDb.collection('users').doc(uid);

    // 1. Delete subcollections
    const counts: Record<string, number> = {};
    for (const sub of SUBCOLLECTIONS) {
      counts[sub] = await deleteCollection(adminDb, `users/${uid}/${sub}`);
    }

    // 2. Delete user doc
    await userRef.delete();

    // 3. Delete Firebase Auth user — do this last so a prior failure leaves
    //    the user able to retry (the client still has a valid session).
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ success: true, deleted: counts });
  } catch (error: unknown) {
    console.error('Account deletion error:', error);
    const message = error instanceof Error ? error.message : 'Account deletion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
