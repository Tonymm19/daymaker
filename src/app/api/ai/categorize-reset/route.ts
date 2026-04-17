/**
 * DAYMAKER CONNECT — Categorization Reset API
 *
 * POST /api/ai/categorize-reset
 *
 * Clears `categories` back to [] on every contact in the user's collection so
 * the categorization pipeline can re-run from scratch (e.g. after a prompt
 * change). Writes in Firestore batches of FIRESTORE_BATCH_LIMIT.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FIRESTORE_BATCH_LIMIT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const contactsRef = adminDb.collection(`users/${uid}/contacts`);

    // listDocuments returns DocumentReferences without fetching field data —
    // cheap for large collections when we only need to write to each doc.
    const refs = await contactsRef.listDocuments();

    let reset = 0;
    for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = refs.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = adminDb.batch();
      for (const ref of chunk) {
        // set+merge is safe if listDocuments ever returns a phantom ref for a
        // doc that only has subcollections; it also leaves other fields intact.
        batch.set(ref, { categories: [] }, { merge: true });
      }
      await batch.commit();
      reset += chunk.length;
    }

    return NextResponse.json({ reset });
  } catch (error: unknown) {
    console.error('[Categorize Reset] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Reset failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
