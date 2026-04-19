import { NextResponse } from 'next/server';

import { getAuth } from 'firebase-admin/auth';
import { callClaude } from '@/lib/ai/claude';
import { embedQuery, retrieveRelevant } from '@/lib/ai/rag';
import { buildQuerySystemPrompt } from '@/lib/ai/prompts/query';
import { FREE_QUERY_LIMIT, RAG_THRESHOLD, DEFAULT_TOP_K, DEFAULT_CLAUDE_MODEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await request.json();
    const query = body.query as string;
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid query parameters' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database uninitialized' }, { status: 500 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g., '2026-04'
    
    let northStar = '';
    let rmPersonaTraits: string[] = [];
    let displayName = 'User';
    let contactCount = 0;
    let rmContext: any = null;

    // 1. Transactional Billing Check & Increment
    try {
      await adminDb.runTransaction(async (t) => {
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
          throw new Error('User document missing');
        }

        const data = userSnap.data()!;
        const isFree = data.plan === 'free';
        northStar = data.northStar || '';
        rmPersonaTraits = data.rmPersonaTraits || [];
        displayName = data.displayName || 'User';
        contactCount = data.contactCount || 0;
        rmContext = {
          rmConnected: !!data.rmConnected,
          rmPersonaTraits: data.rmPersonaTraits || [],
          rmNorthStar: data.rmNorthStar || null,
          rmExpertise: data.rmExpertise || [],
          rmActiveThemes: data.rmActiveThemes || [],
          rmStrategicContext: data.rmStrategicContext || null,
          rmTrackingInterests: data.rmTrackingInterests || [],
        };

        let monthQueries = data.currentMonthQueries || 0;
        const storedMonth = data.currentMonthString || '';

        if (storedMonth !== currentMonth) {
          monthQueries = 0; // Reset for new month
        }

        if (isFree && monthQueries >= FREE_QUERY_LIMIT) {
          throw new Error('LIMIT_EXCEEDED');
        }

        t.update(userRef, {
          currentMonthQueries: monthQueries + 1,
          currentMonthString: currentMonth,
          updatedAt: new Date()
        });
      });
    } catch (err: any) {
      if (err.message === 'LIMIT_EXCEEDED') {
        return NextResponse.json({ error: 'Monthly query limit exceeded on the Free plan. Please upgrade.' }, { status: 429 });
      }
      throw err;
    }

    // 2. Information Retrieval (Full vs RAG)
    let contextData: any[] = [];
    let ragUsed = false;

    if (contactCount > RAG_THRESHOLD) {
      // RAG Pipeline — embed then scan-and-score in batches.
      ragUsed = true;
      const embedStart = Date.now();
      const queryEmbedding = await embedQuery(query);
      const retrieveStart = Date.now();
      contextData = await retrieveRelevant(adminDb, uid, queryEmbedding, DEFAULT_TOP_K);
      console.log(
        `[query] uid=${uid} contacts=${contactCount} embed=${retrieveStart - embedStart}ms ` +
        `retrieve=${Date.now() - retrieveStart}ms matched=${contextData.length}`
      );
    } else {
      // Full Context fetch
      const snapshot = await adminDb.collection(`users/${uid}/contacts`).get();
      contextData = snapshot.docs.map(doc => doc.data());
    }

    // 3. Prompt Construction
    const systemPrompt = buildQuerySystemPrompt(
      displayName,
      northStar,
      rmPersonaTraits,
      contextData,
      rmContext,
    );

    // 4. Call Claude
    const claudeResult = await callClaude({
      model: DEFAULT_CLAUDE_MODEL,
      systemPrompt: systemPrompt,
      userMessage: query,
      maxTokens: 2000,
      temperature: 0.7
    });

    const durationMs = Date.now() - startTime;

    // Lightweight projection of the contacts that were sent to Claude. The
    // client uses this to map names in the markdown response back to real
    // contact records so the results can open ContactDetailModal on click.
    const matchedContacts = contextData
      .filter((c) => c && c.contactId && c.fullName)
      .map((c) => ({
        contactId: c.contactId as string,
        fullName: c.fullName as string,
        linkedInUrl: (c.linkedInUrl as string) || '',
      }));

    return NextResponse.json({
      content: claudeResult.content,
      contactsReferenced: contextData.length,
      matchedContacts,
      tokensUsed: claudeResult.inputTokens + claudeResult.outputTokens,
      ragUsed,
      durationMs
    });

  } catch (error: unknown) {
    console.error('Query Agent error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent query failed' },
      { status: 500 }
    );
  }
}
