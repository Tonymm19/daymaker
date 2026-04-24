import { NextResponse } from 'next/server';
import { callClaude } from '@/lib/ai/claude';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    
    const { getAuth } = await import('firebase-admin/auth');
    await getAuth().verifyIdToken(token);

    const body = await request.json();
    const { contactName, company, position, northStar, goals, currentGoal, connectionType } = body;

    // Prefer the multi-goal array when the caller provides it, else fall
    // back to the legacy single-string field.
    const goalsArray: string[] = Array.isArray(goals)
      ? goals.map((g: unknown) => (typeof g === 'string' ? g.trim() : '')).filter((g: string) => g.length > 0)
      : typeof northStar === 'string' && northStar.trim()
        ? [northStar.trim()]
        : [];

    const connectionTypeLabels: Record<string, string> = {
      cofounder: 'a co-founder',
      client: 'a client',
      investor: 'an investor',
      collaborator: 'a collaborator',
      mentor: 'a mentor',
      other: 'another helpful connection',
    };
    const seekingLabel = connectionType ? (connectionTypeLabels[connectionType] || connectionType) : '';
    const goalsBlock = goalsArray.length <= 1
      ? `The user's primary networking goal (North Star) is: ${goalsArray[0] || 'Build meaningful professional connections.'}`
      : `The user has multiple active North Star goals. Pick the one this contact best maps to and anchor the draft to it:\n${goalsArray.map((g, i) => `  ${i + 1}. ${g}`).join('\n')}`;
    const goalLines = [
      goalsBlock,
      currentGoal && String(currentGoal).trim() ? `The user's current goal is: ${String(currentGoal).trim()}` : '',
      seekingLabel ? `The user is currently seeking: ${seekingLabel}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are an expert executive networking assistant.
Draft a highly personalized, concise LinkedIn direct message outreach to the following contact.
Do NOT include a subject line. Just the message body.
Keep it under 100 words. Be warm, professional, and slightly conversational.

Target Contact: ${contactName}
Company: ${company || 'Unknown'}
Position: ${position || 'Unknown'}

${goalLines}
The message should tie into the user's goals without being overly salesy. When a Current Goal or Seeking preference is present, weight that short-horizon need heavily.`;

    const claudeResult = await callClaude({
      systemPrompt: 'You write excellent, warm outreach messages.',
      userMessage: systemPrompt,
      maxTokens: 500,
      temperature: 0.7
    });

    return NextResponse.json({ draft: claudeResult.content.trim() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to draft message' }, { status: 500 });
  }
}
