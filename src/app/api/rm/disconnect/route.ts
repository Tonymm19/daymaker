/**
 * DAYMAKER CONNECT — Reflections Match Disconnect API
 *
 * POST /api/rm/disconnect
 *
 * Clears the stored RM key and persona fields. Daymaker prompts will fall
 * back to the un-enriched defaults on the next call.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    await adminDb.collection('users').doc(uid).update({
      rmConnected: false,
      rmApiKey: null,
      rmPersonaTraits: [],
      rmNorthStar: null,
      rmExpertise: [],
      rmActiveThemes: [],
      rmStrategicContext: null,
      rmTrackingInterests: [],
      rmLastSyncedAt: null,
      updatedAt: new Date(),
    });

    return NextResponse.json({ disconnected: true });
  } catch (err: unknown) {
    console.error('[RM Disconnect] Fatal:', err);
    const message = err instanceof Error ? err.message : 'Failed to disconnect Reflections Match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
