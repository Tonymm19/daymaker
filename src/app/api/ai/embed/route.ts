import { NextResponse } from 'next/server';

import { getAuth } from 'firebase-admin/auth';
import { embedBatch } from '@/lib/ai/rag';
import { EMBEDDING_BATCH_SIZE, FIRESTORE_BATCH_LIMIT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database uninitialized' }, { status: 500 });
    }

    // 1. Fetch contacts missing embeddings
    const contactsRef = adminDb.collection(`users/${uid}/contacts`);
    // Note: A real implementation might require an index for "where('embedding', '==', null)",
    // but since we keep collection sizes manageable (<10k), we can load and filter, 
    // or we query where embeddingText does not exist. 
    // For absolute robustness without composite index prerequisites, we will load all docs.
    const snapshot = await contactsRef.get();
    
    // Filter docs that need embedding
    const docsToEmbed = snapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.embedding || typeof data.embedding !== 'object' || data.embedding.length === 0;
    });

    if (docsToEmbed.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'All contacts are embedded' });
    }

    let processedCount = 0;
    let errors: string[] = [];

    // 2. Process in batches
    for (let i = 0; i < docsToEmbed.length; i += EMBEDDING_BATCH_SIZE) {
      const batchDocs = docsToEmbed.slice(i, i + EMBEDDING_BATCH_SIZE);
      
      // Build text for each
      const texts = batchDocs.map(doc => {
        const d = doc.data();
        const categoriesStr = d.categories && Array.isArray(d.categories) ? d.categories.join(', ') : 'None';
        return `${d.firstName || ''} ${d.lastName || ''}, ${d.position || 'Unknown Role'} at ${d.company || 'Unknown Company'}. Categories: ${categoriesStr}`;
      });

      try {
        // Run OpenAI SDK
        const embeddings = await embedBatch(texts);
        
        // Write back to Firestore
        const fbBatch = adminDb.batch();
        for (let j = 0; j < batchDocs.length; j++) {
          const docRef = batchDocs[j].ref;
          fbBatch.update(docRef, {
            embedding: embeddings[j],
            embeddingText: texts[j]
          });
        }
        await fbBatch.commit();
        processedCount += batchDocs.length;
        
      } catch (err: unknown) {
        console.error('Embedding batch failed:', err);
        errors.push(err instanceof Error ? err.message : 'Unknown embedding error');
      }
    }

    return NextResponse.json({
      success: true,
      embedded: processedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: unknown) {
    console.error('Embeddings generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}
