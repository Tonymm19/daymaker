/**
 * DAYMAKER CONNECT — Contact Stats Refresh
 *
 * POST /api/contacts/stats/refresh
 *
 * Recomputes the cached `contactStats` object on the user doc. Called by the
 * dashboard on mount when the cached stats are missing (pre-launch users who
 * uploaded before contactStats shipped) or when a caller wants to force a
 * full refresh.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recomputeContactStats } from '@/lib/firebase/stats';

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

    await recomputeContactStats(adminDb, uid);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('[Stats Refresh] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Stats refresh failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
