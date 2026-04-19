/**
 * DAYMAKER CONNECT — Reflections Match Refresh API
 *
 * POST /api/rm/refresh
 *
 * Re-fetches the Twin Payload using the stored RM API key and updates the
 * persona fields on the user doc. Intended for a "Refresh from Reflections
 * Match" button in Settings, or a scheduled background refresh.
 */

import { NextResponse } from 'next/server';
import { fetchTwinPayload, extractPersona, decryptApiKey, RmApiError } from '@/lib/rm/client';

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

    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const data = snap.data() || {};
    if (!data.rmConnected || !data.rmApiKey) {
      return NextResponse.json(
        { error: 'Reflections Match is not connected for this user' },
        { status: 400 },
      );
    }

    let apiKey: string;
    try {
      apiKey = decryptApiKey(data.rmApiKey as string);
    } catch (err) {
      console.error('[RM Refresh] decrypt failed:', err);
      return NextResponse.json(
        { error: 'Stored RM key could not be read. Please disconnect and reconnect.' },
        { status: 500 },
      );
    }

    let payload;
    try {
      payload = await fetchTwinPayload(apiKey);
    } catch (err) {
      if (err instanceof RmApiError) {
        // Token revoked/expired — mark as disconnected so the UI prompts the
        // user to reconnect rather than silently showing stale data.
        if (err.status === 401) {
          await userRef.update({
            rmConnected: false,
            rmApiKey: null,
            updatedAt: new Date(),
          });
        }
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const persona = extractPersona(payload);
    const now = new Date();
    await userRef.update({
      rmPersonaTraits: persona.rmPersonaTraits,
      rmNorthStar: persona.rmNorthStar,
      rmExpertise: persona.rmExpertise,
      rmActiveThemes: persona.rmActiveThemes,
      rmStrategicContext: persona.rmStrategicContext,
      rmTrackingInterests: persona.rmTrackingInterests,
      rmLastSyncedAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      refreshed: true,
      tier: persona.tier,
      displayName: persona.displayName,
      headline: persona.headline,
      personaTraits: persona.rmPersonaTraits,
      northStar: persona.rmNorthStar,
      expertise: persona.rmExpertise,
      activeThemes: persona.rmActiveThemes,
      trackingInterests: persona.rmTrackingInterests,
      lastSyncedAt: now.toISOString(),
    });
  } catch (err: unknown) {
    console.error('[RM Refresh] Fatal:', err);
    const message = err instanceof Error ? err.message : 'Failed to refresh Reflections Match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
