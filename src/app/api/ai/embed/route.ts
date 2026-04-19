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
import { incrementContactStats } from '@/lib/firebase/stats';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 200;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  console.log('[Embed] ▶ Route hit');
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('[Embed] ✗ Missing/invalid Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      console.warn('[Embed] ✗ verifyIdToken failed:', err);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    console.log(`[Embed]   uid=${uid}`);
    console.log(`[Embed]   OPENAI_API_KEY set: ${!!process.env.OPENAI_API_KEY} (length=${process.env.OPENAI_API_KEY?.length ?? 0})`);

    const body = await req.json().catch(() => ({}));
    const rawLimit = body?.limit;
    const limit =
      typeof rawLimit === 'number' && rawLimit > 0
        ? Math.floor(rawLimit)
        : DEFAULT_LIMIT;
    console.log(`[Embed]   limit=${limit}  EMBEDDING_BATCH_SIZE=${EMBEDDING_BATCH_SIZE}`);

    const contactsRef = adminDb.collection(`users/${uid}/contacts`);

    // Count-only helper so the client can drive the loop with accurate progress.
    const countRemaining = async (): Promise<number> => {
      try {
        const snap = await contactsRef.where('embedding', '==', null).count().get();
        return snap.data().count;
      } catch (err) {
        console.error('[Embed]   countRemaining() failed:', err);
        throw err;
      }
    };

    // Probe the overall collection state so we can tell when nothing matches
    // because the `embedding` field is missing (undefined) rather than null.
    const totalSnap = await contactsRef.count().get();
    const totalCount = totalSnap.data().count;
    const nullSnap = await contactsRef.where('embedding', '==', null).count().get();
    const nullCount = nullSnap.data().count;
    const withEmbedSnap = await contactsRef.where('embedding', '!=', null).count().get();
    const withEmbedCount = withEmbedSnap.data().count;
    console.log(`[Embed]   Collection probe — total=${totalCount}  embedding==null: ${nullCount}  embedding!=null: ${withEmbedCount}  (missing/undefined: ${totalCount - nullCount - withEmbedCount})`);

    // Fetch the next slice of contacts needing embeddings. Relies on `embedding`
    // being explicitly set to null at ingest time (confirmed via diagnostic).
    const snapshot = await contactsRef
      .where('embedding', '==', null)
      .limit(limit)
      .get();
    console.log(`[Embed]   Fetched ${snapshot.size} docs needing embeddings (null filter, limit ${limit})`);

    if (snapshot.empty) {
      // Fallback: also check for contacts where the embedding field is missing
      // entirely. The == null filter does NOT match docs with no field.
      const legacySnap = await contactsRef
        .where('embedding', '==', null)
        .limit(1)
        .get();
      if (legacySnap.empty && totalCount > withEmbedCount) {
        console.warn(`[Embed]   ⚠ ${totalCount - withEmbedCount} contacts appear to have no embedding but none match embedding==null. They may be missing the field entirely — check the import pipeline.`);
      }
      console.log(`[Embed] ◀ Finished in ${Date.now() - t0}ms  (nothing to do)`);
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

      const subT0 = Date.now();
      console.log(`[Embed]   → Sub-batch offset=${i}  size=${batchDocs.length}  first="${texts[0]?.slice(0, 80)}..."`);

      try {
        const embeddings = await embedBatch(texts);
        console.log(`[Embed]     ✓ OpenAI returned ${embeddings.length} vectors (dim=${embeddings[0]?.length ?? 0}) in ${Date.now() - subT0}ms`);

        // Firestore caps a batched write at ~10MB total payload. A single
        // text-embedding-3-small vector is 1536 float64 values plus Firestore
        // overhead (~13-20KB on the wire), so 100 per commit trips the
        // "Transaction too big" error. Commit in smaller chunks.
        const FIRESTORE_WRITE_CHUNK = 20;
        const writeT0 = Date.now();
        for (let k = 0; k < batchDocs.length; k += FIRESTORE_WRITE_CHUNK) {
          const chunk = batchDocs.slice(k, k + FIRESTORE_WRITE_CHUNK);
          const fbBatch = adminDb.batch();
          for (let j = 0; j < chunk.length; j++) {
            fbBatch.update(chunk[j].ref, {
              embedding: embeddings[k + j],
              embeddingText: texts[k + j],
            });
          }
          await fbBatch.commit();
        }
        console.log(`[Embed]     ✓ Firestore wrote ${batchDocs.length} docs in ${Date.now() - writeT0}ms (chunks of ${FIRESTORE_WRITE_CHUNK})`);
        processedCount += batchDocs.length;
      } catch (err: unknown) {
        console.error(`[Embed]     ✗ Sub-batch at offset ${i} failed:`, err);
        errors.push(
          `Failed at offset ${i}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const remaining = await countRemaining();
    console.log(`[Embed] ◀ Done in ${Date.now() - t0}ms  processed=${processedCount}  remaining=${remaining}  errors=${errors.length}`);

    if (processedCount > 0) {
      try {
        await incrementContactStats(adminDb, uid, { embedded: processedCount });
      } catch (statsErr) {
        console.warn('[Embed] incrementContactStats failed (non-fatal):', statsErr);
      }
    }

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
