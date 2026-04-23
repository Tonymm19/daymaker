import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

export const dynamic = 'force-dynamic';

// Returns the 15-month connection-count histogram that drives the sparkline on
// /briefing. Exists because the Web SDK doesn't support field projection and
// the page was downloading full contact docs (embeddings and all) just to
// compute this — ~110 MB per page load on Tonya's 8,951-contact account.
// Projects to `connectedOn` only via the admin SDK so the scan is cheap.
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

    const now = new Date();
    const buckets: Record<string, number> = {};
    const orderedKeys: string[] = [];
    for (let i = 14; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      buckets[key] = 0;
      orderedKeys.push(key);
    }

    snap.forEach((doc) => {
      const connectedOn = doc.get('connectedOn');
      if (!connectedOn) return;
      const date = typeof connectedOn.toDate === 'function'
        ? connectedOn.toDate()
        : new Date(connectedOn.seconds * 1000);
      if (isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      if (buckets[key] !== undefined) buckets[key]++;
    });

    return NextResponse.json({
      sparkline: orderedKeys.map((k) => buckets[k]),
    });
  } catch (err: any) {
    console.error('[Sparkline] Error:', err);
    return NextResponse.json({ error: err.message || 'Sparkline fetch failed' }, { status: 500 });
  }
}
