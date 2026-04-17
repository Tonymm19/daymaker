/**
 * DAYMAKER CONNECT — One-off Category Dedupe
 *
 * POST /api/admin/dedupe-categories
 *
 * Scans every contact in the authenticated user's collection and rewrites
 * any contact whose `categories` array contains duplicate entries, keeping
 * the first occurrence of each value. Only touches contacts that actually
 * change (so the writes are minimal and no-op docs are left alone).
 *
 * Returns { fixed, total } — fixed = number of contacts rewritten,
 * total = number of contacts scanned.
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
    } catch (verifyErr) {
      console.error('[DedupeCategories] Token verification failed:', verifyErr);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const contactsRef = adminDb.collection(`users/${uid}/contacts`);
    const snapshot = await contactsRef.get();
    const total = snapshot.size;

    // Collect only the contacts that actually have duplicates — skip the rest.
    const updates: { ref: FirebaseFirestore.DocumentReference; deduped: string[] }[] = [];
    for (const doc of snapshot.docs) {
      const raw = doc.get('categories');
      if (!Array.isArray(raw)) continue;

      // Preserve first-occurrence order while dropping duplicates.
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const item of raw) {
        if (typeof item !== 'string') continue;
        if (seen.has(item)) continue;
        seen.add(item);
        deduped.push(item);
      }

      if (deduped.length !== raw.length) {
        updates.push({ ref: doc.ref, deduped });
      }
    }

    // Commit in Firestore batches of FIRESTORE_BATCH_LIMIT.
    let fixed = 0;
    for (let i = 0; i < updates.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = updates.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = adminDb.batch();
      for (const { ref, deduped } of chunk) {
        batch.update(ref, { categories: deduped });
      }
      await batch.commit();
      fixed += chunk.length;
    }

    return NextResponse.json({ fixed, total });
  } catch (error: unknown) {
    console.error('[DedupeCategories] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Dedupe failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
