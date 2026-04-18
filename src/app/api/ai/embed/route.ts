/**
 * DAYMAKER CONNECT — Embedding Generation API
 *
 * POST /api/ai/embed
 *
 * Resumable, chunked embedding pipeline. Fetches a bounded slice of contacts
 * that are missing an embedding (`embedding == null`), runs them through
 * OpenAI `text-embedding-3-small` in internal sub-batches, and writes the
 * vectors back to Firestore.
 *
 * Request body: { limit?: number }  — max contacts to process this call
 * Response:     { embedded: number, remaining: number, errors?: string[] }
 *
 * The client loops until `remaining === 0`, which keeps any single request
 * well under a serverless timeout regardless of network size.
 */

import { NextRequest, NextResponse } from 'next/server';
import { embedBatch } from '@/lib/ai/rag';
import { EMBEDDING_BATCH_SIZE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 200;

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

    const body = await req.json().catch(() => ({}));
    const rawLimit = body?.limit;
    const limit =
      typeof rawLimit === 'number' && rawLimit > 0
        ? Math.floor(rawLimit)
        : DEFAULT_LIMIT;

    const contactsRef = adminDb.collection(`users/${uid}/contacts`);

    // Count-only helper so the client can drive the loop with accurate progress.
    const countRemaining = async (): Promise<number> => {
      const snap = await contactsRef.where('embedding', '==', null).count().get();
      return snap.data().count;
    };

    // Fetch the next slice of contacts needing embeddings. Relies on `embedding`
    // being explicitly set to null at ingest time (confirmed via diagnostic).
    const snapshot = await contactsRef
      .where('embedding', '==', null)
      .limit(limit)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ embedded: 0, remaining: await countRemaining(), errors: [] });
    }

    const docsToEmbed = snapshot.docs;
    let processedCount = 0;
    const errors: string[] = [];

    // Chunk into OpenAI-sized sub-batches so a single request can process
    // more than EMBEDDING_BATCH_SIZE contacts under one HTTP call.
    for (let i = 0; i < docsToEmbed.length; i += EMBEDDING_BATCH_SIZE) {
      const batchDocs = docsToEmbed.slice(i, i + EMBEDDING_BATCH_SIZE);

      const texts = batchDocs.map(doc => {
        const d = doc.data();
        const categoriesStr =
          Array.isArray(d.categories) && d.categories.length > 0
            ? d.categories.join(', ')
            : 'None';
        return `${d.firstName || ''} ${d.lastName || ''}, ${d.position || 'Unknown Role'} at ${d.company || 'Unknown Company'}. Categories: ${categoriesStr}`;
      });

      try {
        const embeddings = await embedBatch(texts);

        const fbBatch = adminDb.batch();
        for (let j = 0; j < batchDocs.length; j++) {
          fbBatch.update(batchDocs[j].ref, {
            embedding: embeddings[j],
            embeddingText: texts[j],
          });
        }
        await fbBatch.commit();
        processedCount += batchDocs.length;
      } catch (err: unknown) {
        console.error('[Embed] Sub-batch failed:', err);
        errors.push(
          `Failed at offset ${i}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const remaining = await countRemaining();

    return NextResponse.json({
      embedded: processedCount,
      remaining,
      errors,
    });
  } catch (error: unknown) {
    console.error('[Embed API] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}
