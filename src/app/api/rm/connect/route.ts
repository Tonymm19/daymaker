/**
 * DAYMAKER CONNECT — Reflections Match Connect API
 *
 * POST /api/rm/connect
 *
 * Body: { apiKey: string }
 *
 * Validates the key against the Reflections Match Twin Payload endpoint,
 * extracts the persona fields Daymaker uses for AI enrichment, and writes
 * them to the user's Firestore document. The key itself is stored encrypted
 * (AES-256-GCM) when RM_KEY_ENCRYPTION_SECRET is configured.
 */

import { NextResponse } from 'next/server';
import { fetchTwinPayload, extractPersona, encryptApiKey, RmApiError } from '@/lib/rm/client';

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

    const body = await req.json().catch(() => ({}));
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing apiKey' }, { status: 400 });
    }

    // 1. Validate by hitting the RM endpoint.
    let payload;
    try {
      payload = await fetchTwinPayload(apiKey);
    } catch (err) {
      if (err instanceof RmApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    // 2. Extract Daymaker-shaped fields.
    const persona = extractPersona(payload);

    // 3. Persist. Encrypt the key at rest when configured.
    const now = new Date();
    await adminDb.collection('users').doc(uid).update({
      rmConnected: true,
      rmApiKey: encryptApiKey(apiKey),
      rmPersonaTraits: persona.rmPersonaTraits,
      rmNorthStar: persona.rmNorthStar,
      rmExpertise: persona.rmExpertise,
      rmActiveThemes: persona.rmActiveThemes,
      rmStrategicContext: persona.rmStrategicContext,
      rmTrackingInterests: persona.rmTrackingInterests,
      rmLastSyncedAt: now,
      updatedAt: now,
    });

    // 4. Return a summary for the Settings UI. Never echo the key back.
    return NextResponse.json({
      connected: true,
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
    console.error('[RM Connect] Fatal:', err);
    const message = err instanceof Error ? err.message : 'Failed to connect Reflections Match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
