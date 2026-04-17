import { NextResponse } from 'next/server';
import { embedQuery, retrieveRelevant } from '@/lib/ai/rag';
import type { Contact, DeepDive, DaymakerUser } from '@/lib/types';
import { randomUUID } from 'crypto';
import { callClaude, extractJson } from '@/lib/ai/claude';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await req.json();
    let { userId, targetContactId } = body;
    if (!userId) {
      userId = uid;
    }

    if (!targetContactId) {
      return NextResponse.json({ error: 'Missing targetContactId' }, { status: 400 });
    }

    // 1. Load User
    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userDoc = userSnap.data() as DaymakerUser;

    // 2. Load Target Contact
    const targetSnap = await adminDb.collection('users').doc(userId).collection('contacts').doc(targetContactId).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'Target contact not found' }, { status: 404 });
    }
    const targetContact = targetSnap.data() as Contact;

    // 3. RAG Retrieval context gathering
    // Use the target's company and position as the anchor point
    const contextQuery = `People working in ${targetContact.company || ''} as ${targetContact.position || ''} or related industries.`;
    const queryEmbedding = await embedQuery(contextQuery);
    const searchResultContacts = await retrieveRelevant(adminDb as any, userId, queryEmbedding, 20);
    
    // Evaluate Overlaps (naive string check for shared companies if data lacks exact IDs)
    const matchingCompaniesContext = searchResultContacts.filter(
      (r) => r.company?.toLowerCase() === targetContact.company?.toLowerCase()
    );
    const sharedCompanies = Array.from(new Set(matchingCompaniesContext.map(c => c.company).filter(Boolean)));
    const mutualConnections = matchingCompaniesContext.length;

    // Build Context strings
    let targetContext = `Name: ${targetContact.fullName}\nCompany: ${targetContact.company || 'Unknown'}\nPosition: ${targetContact.position || 'Unknown'}`;
    if (targetContact.categories && targetContact.categories.length > 0) {
      targetContext += `\nCategories: ${targetContact.categories.join(', ')}`;
    }

    let userContext = `Name: ${userDoc.displayName}\nNorth Star: ${userDoc.northStar || 'General networking and growth'}\n`;
    if (userDoc.rmPersonaTraits && userDoc.rmPersonaTraits.length > 0) {
      userContext += `Network Identity: ${userDoc.rmPersonaTraits.join(', ')}\n`;
    }

    const networkOverlapContext = searchResultContacts.map((c: any) => `${c.fullName} (${c.position} at ${c.company})`).join('\n');

    // 4. Claude Execution
    const systemPrompt = `You are an elite dual-agent strategic engine for Daymaker Connect. 
You will simulate a precise 4-round dynamic dialogue between two AI agents:
1. User Agent (representing ${userDoc.displayName})
2. Target Agent (representing ${targetContact.fullName})

For the Target, you have extremely limited public information (just name, company, position). Use your general knowledge of the company and role to fill context. During Round 1, explicitly note when you are inferring contexts rather than working from verified data.

The dialogue MUST alternate naturally ensuring at least one message from EACH agent per round. Do not produce monologues.

Execute the following 4-Round sequence:
- Round 1: Profile Briefing (Introductions, focus areas)
- Round 2: Network Overlap Scan (Identify mutual industries/companies using provided overlap data)
- Round 3: Synergy Identification (Identify 3-5 concrete synergy areas, valuing both sides)
- Round 4: Action Recommendations (Specific steps for both parties)

Return your output EXCLUSIVELY in the exact JSON format specified below. Do not wrap in markdown tags like \`\`\`json. Valid JSON only.

{
  "executiveSummary": "<A cohesive 1-paragraph summary of the dynamic relationship>",
  "synergyScore": <Integer 0-100 indicating alignment strength>,
  "topSynergies": [
    {
      "area": "<Title of synergy>",
      "strength": "<high | medium | low>",
      "valueForUser": "<What User gets from it>",
      "valueForTarget": "<What Target gets from it>"
    }
  ],
  "actionItems": [
    {
      "forParty": "<user | target>",
      "action": "<Direct action to take>",
      "priority": "<high | medium | low>"
    }
  ],
  "rounds": [
    {
      "roundNumber": 1,
      "title": "Profile Briefing",
      "userAgentMessage": "<Agent 1 message>",
      "targetAgentMessage": "<Agent 2 message>"
    },
    {
      "roundNumber": 2,
      "title": "Network Overlap Scan",
      "userAgentMessage": "<Agent 1 message>",
      "targetAgentMessage": "<Agent 2 message>"
    },
    {
      "roundNumber": 3,
      "title": "Synergy Identification",
      "userAgentMessage": "<Agent 1 message>",
      "targetAgentMessage": "<Agent 2 message>"
    },
    {
      "roundNumber": 4,
      "title": "Action Recommendations",
      "userAgentMessage": "<Agent 1 message>",
      "targetAgentMessage": "<Agent 2 message>"
    }
  ]
}`;

    const userPrompt = `
User Data:
${userContext}

Target Data:
${targetContext}

Top 20 Related Connections from User's Network (Overlap Candidates):
${networkOverlapContext}

Execute the 4-Round JSON Deep Dive. Remember to acknowledge the limited Target data in the Target Agent's Round 1 response.
`;

    const response = await callClaude({
      systemPrompt: systemPrompt,
      userMessage: userPrompt,
      temperature: 0.3,
      maxTokens: 3500
    });

    const parsedData = extractJson<any>(response.content);

    // 5. Structure & Persistence
    const deepdiveId = randomUUID();
    const newDeepDive: DeepDive = {
      deepdiveId,
      userId,
      targetContactId,
      targetName: targetContact.fullName,
      targetCompany: targetContact.company || 'Unknown',
      synergyScore: parsedData.synergyScore || 0,
      mutualConnections,
      sharedCompanies,
      topSynergies: parsedData.topSynergies || [],
      actionItems: parsedData.actionItems || [],
      rounds: parsedData.rounds || [],
      executiveSummary: parsedData.executiveSummary || 'No summary generated.',
      createdAt: new Date() as any // Admin SDK mapping
    };

    await adminDb.collection('users').doc(userId).collection('deepdives').doc(deepdiveId).set({
      ...newDeepDive,
      createdAt: new Date()
    });

    return NextResponse.json({ success: true, deepdiveId });

  } catch (err: any) {
    console.error('Deep Dive Gen Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
