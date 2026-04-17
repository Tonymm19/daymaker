/**
 * DAYMAKER CONNECT — Google Calendar Disconnect
 *
 * POST /api/calendar/disconnect
 *
 * Clears stored calendar OAuth tokens from Firestore.
 * The user will need to re-authorize to reconnect.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Clear calendar tokens
    await adminDb.collection('users').doc(uid).update({
      googleCalendarConnected: false,
      googleCalendarAccessToken: null,
      googleCalendarRefreshToken: null,
      googleCalendarTokenExpiry: null,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error('[Calendar Disconnect] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to disconnect calendar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
