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
    const { contactName, company, position, northStar } = body;

    const systemPrompt = `You are an expert executive networking assistant.
Draft a highly personalized, concise LinkedIn direct message outreach to the following contact.
Do NOT include a subject line. Just the message body.
Keep it under 100 words. Be warm, professional, and slightly conversational.

Target Contact: ${contactName}
Company: ${company || 'Unknown'}
Position: ${position || 'Unknown'}

The user's primary networking goal (North Star) is: ${northStar || 'Build meaningful professional connections.'}
The message should loosely tie into the user's goal without being overly salesy.`;

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
