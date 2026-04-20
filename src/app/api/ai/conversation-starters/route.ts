import { NextResponse } from 'next/server';
import { callClaude, extractJson } from '@/lib/ai/claude';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Lazy-import triggers firebase-admin initializeApp() as a side effect of
    // loading @/lib/firebase/admin. Without this, getAuth()/verifyIdToken()
    // throws on cold starts because the default app has never been configured.
    const { adminAuth, adminDb } = await import('@/lib/firebase/admin');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (verifyErr) {
      console.error('[ConversationStarters] Token verification failed:', verifyErr);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { contactName, company, position, northStar, currentGoal, connectionType, contactId } = body as {
      contactName?: string;
      company?: string;
      position?: string;
      northStar?: string;
      currentGoal?: string;
      connectionType?: string;
      contactId?: string;
    };

    if (!contactName) {
      return NextResponse.json({ error: 'Missing contact info' }, { status: 400 });
    }

    // Pull the user's RM persona (if connected) so starters can reference
    // topics the user is genuinely interested in rather than generic hooks.
    let rmBlock = '';
    try {
      const userSnap = await adminDb.collection('users').doc(uid).get();
      if (userSnap.exists) {
        const { buildRmContextBlockFromUser } = await import('@/lib/ai/rm-context');
        rmBlock = buildRmContextBlockFromUser(userSnap.data() as any);
      }
    } catch (err) {
      console.warn('[ConversationStarters] Could not load RM context:', err);
    }

    const connectionTypeLabels: Record<string, string> = {
      cofounder: 'a co-founder',
      client: 'a client',
      investor: 'an investor',
      collaborator: 'a collaborator',
      mentor: 'a mentor',
      other: 'another helpful connection',
    };
    const seekingLabel = connectionType ? (connectionTypeLabels[connectionType] || connectionType) : '';
    const goalLines = [
      `The user's overarching networking goal (North Star) is: ${northStar || 'Build meaningful professional connections.'}`,
      currentGoal && currentGoal.trim() ? `The user's current goal is: ${currentGoal.trim()}` : '',
      seekingLabel ? `The user is currently seeking: ${seekingLabel}` : '',
    ].filter(Boolean).join('\n');

    const userPrompt = `Generate 3-4 short, highly personalized conversation starters for outreach to the target contact.
Keep them extremely concise (1-2 sentences max each).
Do NOT include greetings, just the opening hook.

Target Contact: ${contactName}
Company: ${company || 'Unknown'}
Position: ${position || 'Unknown'}

${goalLines}
${rmBlock}
Ensure the conversation starters align with the user's goals (weight the short-horizon Current Goal / Seeking preference heavily when present) and lean on the user's tracking interests and active themes above (when provided) so the hooks sound like the user, not a template. Still match the target's role.
Format the output EXACTLY as a JSON array of strings. Do not wrap in markdown or add anything else to the response.
Example: ["Hook 1", "Hook 2", "Hook 3"]`;

    let claudeResult;
    try {
      claudeResult = await callClaude({
        systemPrompt: 'You are an expert at writing networking hooks. You strictly output JSON arrays.',
        userMessage: userPrompt,
        maxTokens: 500,
        temperature: 0.7,
      });
    } catch (claudeErr) {
      console.error('[ConversationStarters] Claude call failed:', claudeErr);
      const message = claudeErr instanceof Error ? claudeErr.message : 'Claude API call failed';
      return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 });
    }

    let starters: string[] = [];
    try {
      const parsed = extractJson<unknown>(claudeResult.content);
      if (Array.isArray(parsed)) {
        starters = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
      }
    } catch {
      // Fallback: try to salvage a list from a non-JSON response.
      starters = claudeResult.content
        .split('\n')
        .map(s => s.replace(/^[-*•\d+.)]\s*/, '').replace(/^["']|["']$/g, '').trim())
        .filter(Boolean);
    }

    if (starters.length === 0) {
      console.error(
        '[ConversationStarters] Produced zero starters. Raw content:',
        claudeResult.content?.slice(0, 400),
      );
      return NextResponse.json(
        { error: 'Failed to parse starters from Claude response' },
        { status: 502 },
      );
    }

    // Persist to Firestore so subsequent opens of the contact can display the
    // starters instantly without re-billing Claude. If this write fails we
    // still return the starters — the user gets value this session even if
    // persistence is flaky.
    let persisted = false;
    if (contactId) {
      try {
        const { FieldValue } = await import('firebase-admin/firestore');
        await adminDb
          .collection(`users/${uid}/contacts`)
          .doc(contactId)
          .update({
            conversationStarters: starters,
            startersGeneratedAt: FieldValue.serverTimestamp(),
          });
        persisted = true;
      } catch (writeErr) {
        console.error(
          `[ConversationStarters] Failed to persist starters for contact ${contactId}:`,
          writeErr,
        );
      }
    }

    return NextResponse.json({ starters, persisted });
  } catch (error: unknown) {
    console.error('[ConversationStarters] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate starters';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
