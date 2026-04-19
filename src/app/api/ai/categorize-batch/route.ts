/**
 * DAYMAKER CONNECT — AI Categorization API
 *
 * POST /api/ai/categorize-batch
 *
 * Fetches uncategorized contacts for a user (or specific IDs) and runs them through
 * Claude in batches of 50 to assign 1-3 categories per contact.
 *
 * Updates both the `categories` array and the `searchText` field
 * in Firestore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIZATION_BATCH_SIZE, FIRESTORE_BATCH_LIMIT, CATEGORIES, type Category } from '@/lib/constants';
import { callClaude, extractJson } from '@/lib/ai/claude';
import { buildCategorizationSystemPrompt, buildCategorizationUserMessage } from '@/lib/ai/prompts/categorize';
import { buildSearchText } from '@/lib/csv/linkedin-parser';
import { incrementContactStats } from '@/lib/firebase/stats';

export const dynamic = 'force-dynamic';

interface CategorizationResult {
  contactId: string;
  categories: string[];
}

export async function POST(req: NextRequest) {
  try {
    // Lazy-import to prevent build-time crashes without env vars
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    // 1. Authenticate user
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

    // 2. Parse request body
    const body = await req.json().catch(() => ({}));
    const requestedContactIds: string[] | undefined = body.contactIds;
    const rawLimit = body.limit;
    const limit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.floor(rawLimit) : undefined;

    // 3. Fetch contacts
    const contactsRef = adminDb.collection(`users/${uid}/contacts`);
    let querySnapshot;

    if (requestedContactIds && requestedContactIds.length > 0) {
      // Fetch specific contacts. Firestore 'in' is limited to 30, so chunk.
      const chunks = [];
      for (let i = 0; i < requestedContactIds.length; i += 30) {
        chunks.push(requestedContactIds.slice(i, i + 30));
      }
      const snaps = await Promise.all(
        chunks.map(chunk => contactsRef.where('contactId', 'in', chunk).get())
      );

      const docs = [] as FirebaseFirestore.QueryDocumentSnapshot[];
      snaps.forEach(snap => {
        snap.docs.forEach(doc => docs.push(doc));
      });

      querySnapshot = { docs };
    } else {
      // Find uncategorized contacts. Apply limit so serverless requests stay under the timeout.
      let uncategorizedQuery: FirebaseFirestore.Query = contactsRef.where('categories', '==', []);
      if (limit !== undefined) {
        uncategorizedQuery = uncategorizedQuery.limit(limit);
      }
      querySnapshot = await uncategorizedQuery.get();
    }

    // Helper: count uncategorized contacts remaining (used for progress / chunked calls)
    const countRemaining = async (): Promise<number> => {
      const snap = await contactsRef.where('categories', '==', []).count().get();
      return snap.data().count;
    };

    if (querySnapshot.docs.length === 0) {
      const remaining = await countRemaining();
      return NextResponse.json({ categorized: 0, remaining, errors: [] });
    }

    // Prepare contact data for AI
    const contactsToCategorize = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        docId: doc.id,
        contactId: data.contactId,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        name: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        company: data.company || '',
        position: data.position || '',
      };
    });

    let totalCategorized = 0;
    const errors: string[] = [];
    const validCategoriesSet = new Set(CATEGORIES as ReadonlyArray<string>);

    // Process in batches
    for (let i = 0; i < contactsToCategorize.length; i += CATEGORIZATION_BATCH_SIZE) {
      const batch = contactsToCategorize.slice(i, i + CATEGORIZATION_BATCH_SIZE);
      
      const systemPrompt = buildCategorizationSystemPrompt();
      const userMessage = buildCategorizationUserMessage(
        batch.map(c => ({
          contactId: c.contactId,
          name: c.name,
          company: c.company,
          position: c.position
        }))
      );

      try {
        const response = await callClaude({
          systemPrompt,
          userMessage,
          temperature: 0.1,
          maxTokens: 4096
        });

        const parsed = extractJson<CategorizationResult[]>(response.content);
        
        // Map results by contactId
        const resultsMap = new Map<string, string[]>();
        if (Array.isArray(parsed)) {
          parsed.forEach(res => {
            if (res.contactId && Array.isArray(res.categories)) {
              resultsMap.set(res.contactId, res.categories);
            }
          });
        }

        // Apply updates
        const firestoreBatch = adminDb.batch();
        let opsCount = 0;

        for (const contact of batch) {
          const rawCats = resultsMap.get(contact.contactId) || [];
          
          // Filter to only valid canonical categories and cap at 3
          const validCats = rawCats
            .filter(c => validCategoriesSet.has(c))
            .slice(0, 3);

          if (validCats.length > 0) {
            // Rebuild search text to include the new categories
            const newSearchText = buildSearchText(
              contact.firstName,
              contact.lastName,
              contact.company,
              contact.position,
              validCats
            );

            firestoreBatch.update(contactsRef.doc(contact.docId), {
              categories: validCats,
              searchText: newSearchText
            });
            opsCount++;
            totalCategorized++;
          }
        }

        if (opsCount > 0) {
          await firestoreBatch.commit();
        }

      } catch (err: unknown) {
        console.error('[Categorize Batch] Error processing batch:', err);
        errors.push(`Failed to categorize batch starting at index ${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const remaining = await countRemaining();

    if (totalCategorized > 0) {
      try {
        await incrementContactStats(adminDb, uid, { categorized: totalCategorized });
      } catch (statsErr) {
        console.warn('[Categorize] incrementContactStats failed (non-fatal):', statsErr);
      }
    }

    return NextResponse.json({
      categorized: totalCategorized,
      remaining,
      errors
    });

  } catch (error: unknown) {
    console.error('[Categorize API] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Categorization failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
