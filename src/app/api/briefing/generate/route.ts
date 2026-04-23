import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { Contact, MonthlyBriefing } from '@/lib/types';

export const dynamic = 'force-dynamic';

function getClaude() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key missing');
  }
  return new Anthropic({ apiKey });
}

export async function POST(req: Request) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const { getAuth } = await import('firebase-admin/auth');

    // 1. Auth Validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await req.json();
    const { month } = body; // format: "2026-04"

    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      return NextResponse.json({ error: 'Invalid month format, expected YYYY-MM' }, { status: 400 });
    }

    // Trailing-30 / prior-30 windows. The briefing is "monthly" in cadence
    // but its data windows are rolling — this keeps the delta apples-to-apples
    // regardless of which day in the month the briefing is generated. Previous
    // implementation compared April MTD (partial) against March full month,
    // which mechanically inflated negative deltas early in a month.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const windowCurrentStart = now - 30 * DAY_MS;
    const windowPriorStart = now - 60 * DAY_MS;
    const windowPriorEnd = windowCurrentStart;

    // 2. Fetch User Data
    const userRef = adminDb.collection('users').doc(uid);
    const userDocRef = await userRef.get();
    if (!userDocRef.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userDoc = userDocRef.data();
    const targetNorthStar = userDoc?.northStar?.trim() || "";

    // 3. Fetch ALL Contacts.
    // Project only the fields the briefing logic below actually reads. Pulling
    // the full doc loads the 1,536-dim `embedding` array per contact, which
    // SIGABRTed the container at ~1 GB heap on 9K-contact networks. Same fix
    // pattern as the prebrief projection in a9c215c.
    const contactsSnap = await userRef
      .collection('contacts')
      .select(
        'contactId',
        'fullName',
        'firstName',
        'lastName',
        'company',
        'position',
        'previousCompany',
        'previousPosition',
        'connectedOn',
      )
      .get();
    const allContacts: Contact[] = [];
    contactsSnap.forEach(doc => allContacts.push(doc.data() as Contact));

    // 4. Compute Metrics Locally
    let newConnectionsLast30 = 0;
    let totalNetwork = allContacts.length;
    let newConnectionsPrior30 = 0;

    const newConnectionsList: Contact[] = [];
    const movements: any[] = [];

    // Daily cluster detection runs across the same trailing 30 day window as
    // the headline metric so "cluster detected" and "new connections" agree
    // on what "recent" means.
    const dailyConnectionCounts: Record<string, { count: number; contacts: Contact[] }> = {};

    allContacts.forEach((contact) => {
      // Job Movement
      const hasJobChange = !!(
        (contact.previousCompany && contact.company !== contact.previousCompany) ||
        (contact.previousPosition && contact.position !== contact.previousPosition)
      );

      if (hasJobChange) {
        movements.push({
          contactId: contact.contactId || '',
          contactName: contact.fullName || `${contact.firstName} ${contact.lastName}`,
          movementType: (contact.previousCompany && contact.company !== contact.previousCompany) ? 'company_change' : 'title_change',
          previousValue: contact.previousCompany || contact.previousPosition || '',
          currentValue: (contact.previousCompany && contact.company !== contact.previousCompany) ? contact.company : contact.position,
          recommendation: '' // AI will fill this
        });
      }

      if (contact.connectedOn) {
        const dateObj = contact.connectedOn.toDate ? contact.connectedOn.toDate() : new Date((contact.connectedOn as any).seconds * 1000);
        const ms = dateObj.getTime();

        // Current window: last 30 days (now - 30d, now].
        if (ms > windowCurrentStart && ms <= now) {
          newConnectionsLast30++;
          newConnectionsList.push(contact);

          const dayKey = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getDate().toString().padStart(2, '0')}`;
          if (!dailyConnectionCounts[dayKey]) {
            dailyConnectionCounts[dayKey] = { count: 0, contacts: [] };
          }
          dailyConnectionCounts[dayKey].count++;
          dailyConnectionCounts[dayKey].contacts.push(contact);
        }

        // Prior window: (now - 60d, now - 30d].
        if (ms > windowPriorStart && ms <= windowPriorEnd) {
          newConnectionsPrior30++;
        }
      }
    });

    const networkGrowthPercent = newConnectionsPrior30 === 0
      ? 100
      : Math.round(((newConnectionsLast30 - newConnectionsPrior30) / newConnectionsPrior30) * 100);

    // 5. Cluster Detection
    const detectedClusters = Object.entries(dailyConnectionCounts)
      .filter(([_, data]) => data.count >= 5)
      .map(([date, data]) => ({
        date,
        count: data.count,
        sampleContacts: data.contacts.slice(0, 8).map(c => ({
          name: c.fullName || `${c.firstName} ${c.lastName}`,
          company: c.company || 'Unknown'
        }))
      }));

    // 6. Build Claude Pipeline
    const anthropic = getClaude();

    const systemPrompt = `You are an elite networking strategist generating a structured JSON intelligence report for a user's network this month.
You MUST reply strictly with pure JSON. Do not use markdown backticks, do not include conversation filler.`;

    const userPrompt = `
Analyze the user's networking data for the ${month} briefing window (last 30 days).
User's Goal (North Star): "${targetNorthStar}"

Metrics provided:
- Total Network: ${totalNetwork}
- New Connections (last 30 days): ${newConnectionsLast30}
- New Connections (prior 30 days): ${newConnectionsPrior30}
- Movement Changes size: ${movements.length}
- Detected Clusters: ${JSON.stringify(detectedClusters)}

Contact subsets:
1. Job Movements: ${JSON.stringify(movements.slice(0, 10))}
2. New Connections: ${JSON.stringify(newConnectionsList.map(c => ({
  company: c.company,
  position: c.position,
  name: c.fullName || c.firstName
})).slice(0, 30))}

Based on the subsets provided above, generate the following JSON exactly parsing the intelligence summary:

{
  "introNarrative": "<A personalized 2-sentence summary paragraph greeting the user and evaluating the month's metrics>",
  "summaryNarrative": "<1-2 sentences on what was missed or where to focus next>",
  "movements": [
    // Output up to 4 job movements, taking the provided list and writing a custom follow-up recommendation for each
    {
      "contactId": "<id>",
      "contactName": "<name>",
      "movementType": "<company_change | title_change>",
      "previousValue": "<prev>",
      "currentValue": "<cur>",
      "recommendation": "<A sharp action to take>"
    }
  ],
  "followUps": [
    // Pick the 3-6 most strategically valuable 'New Connections' that align to the North Star. Give priority, insight, and opener.
    {
      "contactId": "generate-an-id-if-none",
      "contactName": "<name>",
      "company": "<company>",
      "position": "<pos>",
      "priority": "<high | warm | standard>",
      "insight": "<Why they matter relative to North Star>",
      "suggestedOpener": "<Detailed conversational email opener>",
      "matchedGoals": ["<goal keyword 1>", "<goal keyword 2>"]
    }
  ],
  "clusters": [
    // Process the Detected Clusters and give them dynamic names, evaluating the common industry.
    {
      "name": "<e.g. The Robotics Summit Cluster>",
      "description": "<Assessment>",
      "contactCount": <count>,
      "connectedDate": "<date>",
      "industry": "<guessed industry>",
      "contacts": [ { "name": "Name", "company": "Company" } ]
    }
  ],
  "goals": [
    // Provide 1-3 progress blocks against the North Star
    {
      "goal": "<Sub-goal mapped from North star>",
      "progressPercent": <integer 0-100 indicating momentum>,
      "summary": "<1-2 lines on the state of the goal>",
      "keyContacts": ["<name 1>"]
    }
  ]
}
    `;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const outputText = ('text' in message.content[0]) ? message.content[0].text : '';
    const cleanedJson = outputText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    // Wrap the parse: Claude occasionally returns truncated or markdown-wrapped
    // JSON. Log the raw response so failures are diagnosable, then 502 so the
    // client knows to retry. No quota refund needed — this endpoint doesn't
    // currently track briefing quota.
    let parsedBriefing: any;
    try {
      parsedBriefing = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('[Monthly Briefing] JSON parse failed. Raw response:', outputText);
      return NextResponse.json(
        { error: 'parse_failed', message: 'Claude response could not be parsed. Please try again.' },
        { status: 502 },
      );
    }

    // 7. Store Result
    const briefingId = month; // e.g. '2026-04'
    const finalBriefingPayload: MonthlyBriefing = {
      briefingId,
      userId: uid,
      month,
      generatedAt: new Date() as any, // mapping Admin timestamp back to type
      newConnections: newConnectionsLast30,
      totalNetwork: totalNetwork,
      networkGrowthPercent,
      movements: parsedBriefing.movements || [],
      followUps: parsedBriefing.followUps || [],
      clusters: parsedBriefing.clusters || [],
      goals: parsedBriefing.goals || [],
      introNarrative: parsedBriefing.introNarrative || '',
      summaryNarrative: parsedBriefing.summaryNarrative || '',
      currentWindowLabel: 'last 30 days',
      previousWindowLabel: 'prior 30 days',
    };

    const docRef = adminDb.collection('users').doc(uid).collection('briefings').doc(briefingId);
    await docRef.set({
      ...finalBriefingPayload,
      generatedAt: new Date()
    }, { merge: true });

    return NextResponse.json({ success: true, briefing: finalBriefingPayload });

  } catch (err: any) {
    console.error('Monthly Briefing Gen Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
