import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

export const dynamic = 'force-dynamic';

// Returns 15 rolling 30-day window counts that drive the sparkline on
// /briefing. Each bucket is a 30-day window so every bar is the same length
// and the last bar doesn't shrink as the month progresses. Matches the
// headline delta's trailing-30 framing. Index 0 is oldest (420-450 days ago),
// index 14 is newest (last 30 days).
//
// Exists because the Firestore Web SDK doesn't support field projection and
// the page was downloading full contact docs (embeddings and all) to compute
// this — ~110 MB per page load on Tonya's 8,951-contact account. This route
// uses the admin SDK's .select('connectedOn') so the scan is cheap.
export async function GET(request: Request) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database uninitialized' }, { status: 500 });
    }

    const snap = await adminDb
      .collection(`users/${uid}/contacts`)
      .select('connectedOn')
      .get();

    const DAY_MS = 24 * 60 * 60 * 1000;
    const WINDOW_MS = 30 * DAY_MS;
    const BUCKETS = 15;
    const now = Date.now();
    const oldestStart = now - BUCKETS * WINDOW_MS;
    const buckets = new Array<number>(BUCKETS).fill(0);

    snap.forEach((doc) => {
      const connectedOn = doc.get('connectedOn');
      if (!connectedOn) return;
      const date = typeof connectedOn.toDate === 'function'
        ? connectedOn.toDate()
        : new Date(connectedOn.seconds * 1000);
      const ms = date.getTime();
      if (isNaN(ms)) return;
      if (ms <= oldestStart || ms > now) return;
      // Bucket 14 is most recent (now - 30d, now]; bucket 0 is oldest.
      const offsetFromNow = now - ms;
      const idx = BUCKETS - 1 - Math.floor(offsetFromNow / WINDOW_MS);
      if (idx >= 0 && idx < BUCKETS) buckets[idx]++;
    });

    return NextResponse.json({ sparkline: buckets });
  } catch (err: any) {
    console.error('[Sparkline] Error:', err);
    return NextResponse.json({ error: err.message || 'Sparkline fetch failed' }, { status: 500 });
  }
}
