import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CLAUDE_MODEL, FREE_EVENT_LIMIT } from '@/lib/constants';

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await req.json();
    const {
      eventName,
      eventDate,
      eventLocation,
      eventDescription,
      detectedUrls,
      attendees,
    } = body as {
      eventName?: string;
      eventDate?: string;
      eventLocation?: string;
      eventDescription?: string;
      detectedUrls?: { luma?: string | null; eventbrite?: string | null };
      attendees?: { name?: string; company?: string; title?: string }[];
    };

    if (!eventName || !attendees || !Array.isArray(attendees)) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Fetch User Data
    const userRef = adminDb.collection('users').doc(uid);
    const userDocRef = await userRef.get();
    
    if (!userDocRef.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = userDocRef.data();
    if (!userDoc) {
      return NextResponse.json({ error: 'User data corrupted' }, { status: 500 });
    }

    // Plan limit check. Free tier is 0 — Event Briefings are Pro-only.
    const now = new Date();
    const currentMonthString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    let currentMonthEvents = userDoc.currentMonthEvents || 0;
    if (userDoc.currentMonthString !== currentMonthString) {
      currentMonthEvents = 0;
    }

    if (userDoc.plan === 'free' && currentMonthEvents >= FREE_EVENT_LIMIT) {
      return NextResponse.json({
        error: 'limit_reached',
        message: 'Event Briefings require a Pro subscription. Upgrade to unlock.',
        upgradeUrl: '/settings',
      }, { status: 429 });
    }

    // Target User North Star string
    const targetNorthStar = userDoc.northStar?.trim() || "Identify the most strategically valuable connections for a professional networking context.";
    const currentGoal = (userDoc.currentGoal || '').trim();
    const connectionTypeLabels: Record<string, string> = {
      cofounder: 'a co-founder',
      client: 'a client',
      investor: 'an investor',
      collaborator: 'a collaborator',
      mentor: 'a mentor',
      other: 'another helpful connection',
    };
    const seekingLabel = userDoc.connectionType
      ? (connectionTypeLabels[userDoc.connectionType] || userDoc.connectionType)
      : '';
    const currentGoalBlock = currentGoal || seekingLabel
      ? `\n        The user's current focus: ${[
          currentGoal && `Current Goal — ${currentGoal}`,
          seekingLabel && `Seeking — ${seekingLabel}`,
        ].filter(Boolean).join('. ')}. Weight this short-horizon need heavily when scoring relevance.`
      : '';

    // Reflections Match persona block (empty string if not connected) — adds
    // active themes, emerging interests, and expertise so attendee relevance
    // scoring reflects what the user genuinely cares about today.
    const { buildRmContextBlockFromUser } = await import('@/lib/ai/rm-context');
    const rmBlock = buildRmContextBlockFromUser(userDoc);

    // 2. Fetch User's Contacts to Determine Network Anchors
    const hiddenSet = new Set(userDoc.hiddenContacts || []);
    const contactsSnap = await userRef.collection('contacts').get();
    const networkByName = new Map<string, { contactId: string; linkedInUrl: string }>();
    contactsSnap.forEach(doc => {
      const data = doc.data();
      if (hiddenSet.has(data.contactId)) return;
      const record = { contactId: data.contactId, linkedInUrl: data.linkedInUrl || '' };
      if (data.firstName && data.lastName) {
        networkByName.set(`${data.firstName} ${data.lastName}`.toLowerCase(), record);
      } else if (data.fullName) {
        networkByName.set(data.fullName.toLowerCase(), record);
      }
    });

    // Bucket attendees into mapped input objects
    const mappedAttendeesToProcess = attendees.map(att => {
      const match = networkByName.get((att.name || '').toLowerCase().trim());
      return {
        name: att.name || 'Unknown',
        company: att.company || 'Unknown',
        title: att.title || 'Unknown',
        anchorStatus: match ? 'anchor' : 'new',
        _contactId: match?.contactId,
        _linkedInUrl: match?.linkedInUrl,
      };
    });

    // 3. Trigger Claude Batch
    const anthropic = getClaude();
    const generatedAttendees: any[] = [];
    const failedBatches: { startIndex: number; size: number; error: string }[] = [];

    // Build event-context block once (shared across batches)
    const descriptionBlock = eventDescription?.trim()
      ? `\n        Event Description:\n        """${eventDescription.trim()}"""`
      : '';

    const urlLines: string[] = [];
    if (detectedUrls?.luma) urlLines.push(`- Luma event page: ${detectedUrls.luma}`);
    if (detectedUrls?.eventbrite) urlLines.push(`- Eventbrite page: ${detectedUrls.eventbrite}`);
    const urlsBlock = urlLines.length
      ? `\n        Related event URLs (use to infer theme/audience, do not fabricate content from them):\n        ${urlLines.join('\n        ')}`
      : '';

    // Batching to prevent prompt overload (max 50 at a time)
    const BATCH_SIZE = 50;
    for (let i = 0; i < mappedAttendeesToProcess.length; i += BATCH_SIZE) {
      const batchFull = mappedAttendeesToProcess.slice(i, i + BATCH_SIZE);
      // Strip private enrichment fields before sending to Claude — the model
      // should only see what influences its scoring.
      const batch = batchFull.map(({ _contactId, _linkedInUrl, ...rest }) => rest);

      const promptContext = `
        You are an elite networking strategist. The user is attending an event called "${eventName}" in "${eventLocation || 'an unspecified location'}".
        The user's core strategic goal (North Star) is: "${targetNorthStar}"${currentGoalBlock}
${rmBlock}${descriptionBlock}${urlsBlock}

        Use the event description and any URLs above as context about the event's theme, audience, and likely conversations so your relevance scoring and conversation starters are grounded in that context.

        I will provide a JSON list of attendees. For each attendee, generate an intelligence briefing matching this exact strict JSON array structure:
        [
          {
            "name": "Exact Name Provided",
            "company": "Exact Company Provided",
            "position": "Exact Title Provided",
            "relevanceScore": <integer between 1-100 indicating alignment with the North Star>,
            "isInNetwork": <boolean true if anchorStatus was 'anchor', else false>,
            "connectionType": <"must_meet" | "worth_meeting" | "anchor" | "new">,
            "whyTheyMatter": "<1-2 sentences on why they are strategically relevant>",
            "conversationStarters": [
              "<Starter 1>",
              "<Starter 2>",
              "<Starter 3>"
            ],
            "networkGapAnalysis": "<What connecting with this person fills>",
            "followUpRecommendation": "<A strategic follow-up recommendation>"
          }
        ]

        Connection Type Logic:
        - If they are an anchor (already in network), output "anchor".
        - If they are new and highly relevant (relevanceScore > 80), output "must_meet".
        - If they are new and moderately relevant (50 < relevanceScore <= 80), output "worth_meeting".
        - If they are new and low relevance, output "new".

        Return ONLY pure valid JSON. No markdown backticks, no preamble. Just the raw array.

        Attendees Data:
        ${JSON.stringify(batch)}
      `;

      try {
        const message = await anthropic.messages.create({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: 8192,
          temperature: 0.2,
          system: "You are a specialized JSON-emitting strategic networking agent. You never output conversational filler texts.",
          messages: [
            { role: 'user', content: promptContext }
          ]
        });

        const textOutput = ('text' in message.content[0]) ? message.content[0].text : '';
        const cleanedStr = textOutput.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        const parsedArr = JSON.parse(cleanedStr);

        // Re-attach network enrichment (contactId, linkedInUrl) to each attendee
        // by matching back to the input batch by name.
        const enrichmentByName = new Map<string, { contactId?: string; linkedInUrl?: string }>();
        for (const row of batchFull) {
          enrichmentByName.set(row.name.toLowerCase().trim(), {
            contactId: row._contactId,
            linkedInUrl: row._linkedInUrl,
          });
        }
        for (const att of parsedArr) {
          const enrich = enrichmentByName.get((att.name || '').toLowerCase().trim());
          if (enrich?.contactId) att.contactId = enrich.contactId;
          if (enrich?.linkedInUrl) {
            att.linkedInUrl = enrich.linkedInUrl;
          } else if (att.name) {
            // Fall back to a LinkedIn search URL so the "View LinkedIn Profile"
            // button is always usable, even for non-network attendees.
            att.linkedInUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(att.name + (att.company ? ' ' + att.company : ''))}`;
          }
        }
        generatedAttendees.push(...parsedArr);
      } catch (err: any) {
        console.error(`Claude Batch starting at index ${i} failed:`, err.message);
        failedBatches.push({
          startIndex: i,
          size: batch.length,
          error: err?.message || 'Unknown error',
        });
        // Keep going — partial results are better than no results.
      }
    }

    // If every batch failed, don't save an empty briefing.
    if (generatedAttendees.length === 0) {
      return NextResponse.json({
        error: 'AI generation failed for all attendee batches.',
        failedBatches,
      }, { status: 502 });
    }

    // 4. Save Event Briefing directly in Firestore
    const eventId = adminDb.collection('users').doc(uid).collection('events').doc().id;
    const eventPayload = {
      eventId,
      userId: uid,
      eventName,
      eventDate: eventDate ? new Date(eventDate) : null,
      eventLocation: eventLocation || '',
      attendees: generatedAttendees,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await adminDb.collection('users').doc(uid).collection('events').doc(eventId).set(eventPayload);

    // Update Limits Atomically
    await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(userRef);
      if (!docSnap.exists) return;
      const data = docSnap.data();
      if (!data) return;

      const limitsNow = new Date();
      const limitsMonthStr = `${limitsNow.getFullYear()}-${(limitsNow.getMonth() + 1).toString().padStart(2, '0')}`;
      
      let newEventCount = data.currentMonthEvents || 0;
      if (data.currentMonthString !== limitsMonthStr) {
        newEventCount = 1; 
      } else {
        newEventCount += 1;
      }

      transaction.update(userRef, {
        currentMonthEvents: newEventCount,
        currentMonthString: limitsMonthStr
      });
    });

    return NextResponse.json({
      eventId,
      success: true,
      ...(failedBatches.length > 0 ? {
        partial: true,
        failedBatches,
        generatedCount: generatedAttendees.length,
        requestedCount: mappedAttendeesToProcess.length,
      } : {}),
    });

  } catch (error: any) {
    console.error('Event Pre-Briefing error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
