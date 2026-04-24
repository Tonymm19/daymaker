import { NextResponse } from 'next/server';
import { embedQuery, retrieveRelevant } from '@/lib/ai/rag';
import type { Contact, DeepDive, DaymakerUser } from '@/lib/types';
import { randomUUID } from 'crypto';
import { callClaude, extractJson } from '@/lib/ai/claude';
import { buildRmContextBlockFromUser } from '@/lib/ai/rm-context';
import { getNorthStarGoals } from '@/lib/ai/goals';
import { FREE_DEEPDIVE_LIMIT } from '@/lib/constants';

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
    // Fallback so prompts never contain "representing undefined" if the user
    // doc is missing a displayName (early-lifecycle accounts, seeded records).
    const userDisplayName = userDoc.displayName || 'the user';

    // 2. Load Target Contact — done BEFORE the plan-limit transaction so we
    //    never charge a Deep Dive for a contact that can't produce a useful
    //    analysis.
    const targetSnap = await adminDb.collection('users').doc(userId).collection('contacts').doc(targetContactId).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'Target contact not found' }, { status: 404 });
    }
    const targetContact = targetSnap.data() as Contact;

    // 2a. Reject contacts with no company AND no position. Without either, the
    //     context query is empty and Claude returns generic filler.
    const hasCompany = !!(targetContact.company && targetContact.company.trim());
    const hasPosition = !!(targetContact.position && targetContact.position.trim());
    if (!hasCompany && !hasPosition) {
      return NextResponse.json({
        error: 'insufficient_contact_data',
        message: 'This contact has insufficient profile data (missing both company and position). Add details to the contact and try again.',
      }, { status: 400 });
    }

    // 3. Plan limit check + increment (transactional so we can't double-charge
    //    a racing caller on the free tier).
    const userRef = adminDb.collection('users').doc(userId);
    const nowForLimit = new Date();
    const currentMonthStr = `${nowForLimit.getFullYear()}-${(nowForLimit.getMonth() + 1).toString().padStart(2, '0')}`;
    try {
      await adminDb.runTransaction(async (t) => {
        const snap = await t.get(userRef);
        if (!snap.exists) throw new Error('User not found');
        const data = snap.data()!;
        const isFree = data.plan === 'free';
        const storedMonth = data.currentMonthString || '';
        let count = storedMonth === currentMonthStr ? (data.currentMonthDeepDives || 0) : 0;
        if (isFree && count >= FREE_DEEPDIVE_LIMIT) {
          throw new Error('LIMIT_EXCEEDED');
        }
        count += 1;
        t.update(userRef, {
          currentMonthDeepDives: count,
          currentMonthString: currentMonthStr,
          updatedAt: new Date(),
        });
      });
    } catch (err: any) {
      if (err.message === 'LIMIT_EXCEEDED') {
        return NextResponse.json({
          error: 'limit_reached',
          message: `You've used your ${FREE_DEEPDIVE_LIMIT} free Deep Dive this month. Upgrade to Pro for unlimited Deep Dives.`,
          upgradeUrl: '/settings',
        }, { status: 429 });
      }
      throw err;
    }

    // 3. RAG Retrieval context gathering
    // Use the target's company and position as the anchor point
    const contextQuery = `People working in ${targetContact.company || ''} as ${targetContact.position || ''} or related industries.`;
    const queryEmbedding = await embedQuery(contextQuery);
    let searchResultContacts = await retrieveRelevant(adminDb as any, userId, queryEmbedding, 20);

    // Drop hidden contacts from overlap candidates. Hidden contacts should not
    // show up as "Contacts at Similar Companies" in Deep Dive context either.
    const hiddenSet = new Set(userDoc.hiddenContacts || []);
    if (hiddenSet.size > 0) {
      searchResultContacts = searchResultContacts.filter((c: any) => !hiddenSet.has(c?.contactId));
    }
    
    // Evaluate Overlaps (naive string check for shared companies if data lacks exact IDs)
    const matchingCompaniesContext = searchResultContacts.filter(
      (r) => r.company?.toLowerCase() === targetContact.company?.toLowerCase()
    );
    const sharedCompanies = Array.from(new Set(matchingCompaniesContext.map(c => c.company).filter(Boolean)));
    const mutualConnections = matchingCompaniesContext.length;

    // Build Context strings
    let targetContext = `Name: ${targetContact.fullName}\nCompany: ${targetContact.company || 'Unknown'}\nPosition: ${targetContact.position || 'Unknown'}`;

    // Surface the connection recency so the model can weight stale, long-dormant
    // connections lower in the synergy score.
    const connectedOnRaw: any = targetContact.connectedOn;
    let connectedOnDate: Date | null = null;
    if (connectedOnRaw) {
      if (typeof connectedOnRaw.toDate === 'function') connectedOnDate = connectedOnRaw.toDate();
      else if (typeof connectedOnRaw.seconds === 'number') connectedOnDate = new Date(connectedOnRaw.seconds * 1000);
      else {
        const d = new Date(connectedOnRaw);
        if (!isNaN(d.getTime())) connectedOnDate = d;
      }
    }
    if (connectedOnDate) {
      const iso = connectedOnDate.toISOString().slice(0, 10);
      const yearsAgo = ((Date.now() - connectedOnDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1);
      targetContext += `\nConnected On: ${iso} (${yearsAgo} years ago)`;
    } else {
      targetContext += `\nConnected On: Unknown`;
    }

    if (targetContact.previousCompany && targetContact.previousCompany !== targetContact.company) {
      targetContext += `\nPrevious Company: ${targetContact.previousCompany}`;
    }

    if (targetContact.categories && targetContact.categories.length > 0) {
      targetContext += `\nCategories: ${targetContact.categories.join(', ')}`;
    }

    const userGoals = getNorthStarGoals(userDoc);
    const goalsHeader = userGoals.length <= 1
      ? `North Star: ${userGoals[0] || 'General networking and growth'}`
      : `North Star Goals (multiple active; score the contact against each and surface the best fit):\n${userGoals.map((g, i) => `  ${i + 1}. ${g}`).join('\n')}`;
    let userContext = `Name: ${userDisplayName}\n${goalsHeader}\n`;
    if (userDoc.currentGoal && userDoc.currentGoal.trim()) {
      userContext += `Current Goal: ${userDoc.currentGoal.trim()}\n`;
    }
    if (userDoc.connectionType) {
      const label: Record<string, string> = {
        cofounder: 'a co-founder',
        client: 'a client',
        investor: 'an investor',
        collaborator: 'a collaborator',
        mentor: 'a mentor',
        other: 'another helpful connection',
      };
      userContext += `Seeking: ${label[userDoc.connectionType] || userDoc.connectionType}\n`;
    }
    if (userDoc.onboardingAnswers?.ninetyDayGoal?.trim()) {
      userContext += `90-Day Goal & Who Needs to Be in the Room: ${userDoc.onboardingAnswers.ninetyDayGoal.trim()}\n`;
    }
    if (userDoc.onboardingAnswers?.successfulConnection?.trim()) {
      userContext += `What a Successful Connection Looks Like This Month: ${userDoc.onboardingAnswers.successfulConnection.trim()}\n`;
    }
    if (userDoc.rmPersonaTraits && userDoc.rmPersonaTraits.length > 0) {
      userContext += `Network Identity: ${userDoc.rmPersonaTraits.join(', ')}\n`;
    }
    const rmBlock = buildRmContextBlockFromUser(userDoc);
    if (rmBlock) {
      userContext += `${rmBlock}\n`;
    }

    const networkOverlapContext = searchResultContacts.map((c: any) => `${c.fullName} (${c.position} at ${c.company})`).join('\n');

    // 4. Claude Execution
    const systemPrompt = `You are an elite dual-agent strategic engine for Daymaker Connect. 
You will simulate a precise 4-round dynamic dialogue between two AI agents:
1. User Agent (representing ${userDisplayName})
2. Target Agent (representing ${targetContact.fullName})

For the Target, you have extremely limited public information (just name, company, position). Use your general knowledge of the company and role to fill context. During Round 1, explicitly note when you are inferring contexts rather than working from verified data.

DATA SCOPE — READ CAREFULLY:
You only have access to the user's imported LinkedIn connections, not the target person's connections. The "Overlap Candidates" list below contains the USER's contacts who happen to work at companies related to the target — these are NOT verified mutual connections between the user and the target. Do not claim there are zero mutual connections. Instead, when mutual-connection data is relevant, say: "Mutual connection data requires both users to be on Daymaker Connect." When describing overlap, use the phrase "Network Overlap" (companies/industries that appear in both sides' contexts) and "Contacts at Similar Companies" (the user's connections who work at the target's company or related ones). Never use the bare phrase "Mutual Connections" to describe this data.

The dialogue MUST alternate naturally ensuring at least one message from EACH agent per round. Do not produce monologues.

Execute the following 4-Round sequence:
- Round 1: Profile Briefing (Introductions, focus areas)
- Round 2: Network Overlap Scan (Identify overlapping industries/companies using provided overlap data; treat these as the user's contacts at similar companies, not verified mutuals)
- Round 3: Alignment Identification (Identify 3-5 concrete alignment areas, valuing both sides)
- Round 4: Action Recommendations (Specific steps for both parties)

SCORING TRANSPARENCY:
When assigning the alignment score (emitted as the synergyScore JSON field for backward compatibility), break the score into exactly these four weighted factors and report each factor's actual contribution (0..weight) based on how this specific target performed on that dimension:
- Goal Match (weight 40): How directly this contact aligns with the user's stated North Star goal(s). Current Goal / Seeking preference (if provided) should carry at least as much weight as the North Star within this factor. When the user has multiple North Star goals, the best-matching goal determines this factor's contribution — name the goal.
- Career Relevance (weight 30): Seniority, decision-making power, and the target's current role, company, or trajectory relative to the user's needs.
- Network Overlap (weight 20): Shared companies, industries, mutual context, or bridgeable relationships with the user.
- Activity Recency (weight 10): Freshness of the connection (use the Connected On date) and whether the position looks current vs outdated. Recent (≤2 years, current role) scores high; stale (>5 years, possibly outdated) scores low.

The sum of the four contributions should roughly equal synergyScore.

Also produce a scoreSummary: one plain-language sentence that reads like something a thoughtful chief of staff would write. It should name the factor(s) that moved the score most (e.g. "Strong North Star alignment and current role, dragged down by stale 7-year-old connection.").

The executiveSummary is separate and may be a full paragraph; the scoreSummary is one sentence that explains the number specifically.

DATA FRESHNESS:
If the target's LinkedIn data appears outdated — no previousCompany change captured, connected many years ago (>5y) with a junior or generic title, or a position that reads as a past role — factor this into a LOWER score and call it out in the executiveSummary and Round 1 User Agent message. Include the Connected On date in your analysis context when discussing recency.

Return your output EXCLUSIVELY in the exact JSON format specified below. Do not wrap in markdown tags like \`\`\`json. Valid JSON only.

{
  "executiveSummary": "<A cohesive 1-paragraph summary of the dynamic relationship>",
  "synergyScore": <Integer 0-100 indicating alignment strength>,
  "scoreSummary": "<ONE sentence plain-language explanation of what drove this specific score>",
  "scoreFactors": [
    { "name": "Goal Match",       "weight": 40, "contribution": <integer 0-40> },
    { "name": "Career Relevance", "weight": 30, "contribution": <integer 0-30> },
    { "name": "Network Overlap",  "weight": 20, "contribution": <integer 0-20> },
    { "name": "Activity Recency", "weight": 10, "contribution": <integer 0-10> }
  ],
  "topSynergies": [
    {
      "area": "<Title of alignment area>",
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
      "title": "Alignment Identification",
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
      // temperature 0 keeps the synergy score stable across regenerations so
      // repeat runs on the same contact don't swing the number by 15+ points.
      temperature: 0,
      // 8000 gives headroom for executive summary + 3-5 synergies + action
      // items for both parties + 4 full dialogue rounds. At Sonnet pricing
      // Claude only writes what it needs, so the higher ceiling doesn't
      // raise typical cost — it prevents truncation.
      maxTokens: 8000
    });

    // Fix C2: parse failures used to 500 after the user was already charged a
    // Deep Dive. Catch here, log the raw response for debugging, refund the
    // quota, and return a 502 so the client knows nothing was counted.
    let parsedData;
    try {
      parsedData = extractJson<any>(response.content);
    } catch {
      console.error('[Deep Dive] JSON parse failed. Raw response:', response.content);
      try {
        await adminDb.runTransaction(async (t) => {
          const snap = await t.get(userRef);
          if (!snap.exists) return;
          const data = snap.data()!;
          const storedMonth = data.currentMonthString || '';
          const current = storedMonth === currentMonthStr ? (data.currentMonthDeepDives || 0) : 0;
          const refunded = Math.max(0, current - 1);
          t.update(userRef, {
            currentMonthDeepDives: refunded,
            updatedAt: new Date(),
          });
        });
      } catch (refundErr) {
        console.error('[Deep Dive] Quota refund failed after parse error:', refundErr);
      }
      return NextResponse.json({
        error: 'parse_failed',
        message: 'Analysis failed to generate valid results. Please try again. No Deep Dive was counted against your plan.',
      }, { status: 502 });
    }

    // 5. Structure & Persistence
    const deepdiveId = randomUUID();
    // Validate scoreFactors minimally: accept the array only when it has the
    // expected four factors with numeric weights/contributions. Pre-existing
    // prompts that don't return factors just drop through with undefined.
    const rawFactors = Array.isArray(parsedData.scoreFactors) ? parsedData.scoreFactors : null;
    const scoreFactors = rawFactors
      ? rawFactors
          .filter((f: any) => f && typeof f.name === 'string' && typeof f.weight === 'number' && typeof f.contribution === 'number')
          .map((f: any) => ({
            name: String(f.name),
            weight: Math.max(0, Math.min(100, Math.round(f.weight))),
            contribution: Math.max(0, Math.min(100, Math.round(f.contribution))),
          }))
      : undefined;
    const scoreSummary = typeof parsedData.scoreSummary === 'string' && parsedData.scoreSummary.trim()
      ? parsedData.scoreSummary.trim()
      : undefined;
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
      createdAt: new Date() as any, // Admin SDK mapping
      ...(scoreSummary ? { scoreSummary } : {}),
      ...(scoreFactors && scoreFactors.length > 0 ? { scoreFactors } : {}),
    };

    await adminDb.collection('users').doc(userId).collection('deepdives').doc(deepdiveId).set({
      ...newDeepDive,
      createdAt: new Date()
    });

    // Mark the contact as analyzed so the "needs follow-up" logic can surface
    // them after FOLLOW_UP_WINDOW_DAYS if no outreach has happened.
    try {
      await adminDb.collection('users').doc(userId).collection('contacts').doc(targetContactId).update({
        lastAnalyzedAt: new Date(),
      });
    } catch (err) {
      console.warn('[DeepDive] lastAnalyzedAt write failed:', err);
    }

    return NextResponse.json({ success: true, deepdiveId });

  } catch (err: any) {
    console.error('Deep Dive Gen Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
