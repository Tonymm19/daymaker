import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_VIA = new Set(['manual', 'linkedin', 'draft-message']);

// Marks a contact as followed-up. Called from the LinkedIn "Send via"
// button, the draft-message send path, and the manual "Mark as followed up"
// button on overdue contact cards. Writes lastFollowedUpAt = now and a
// source tag. Clears the overdue signal on next page load.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const { contactId } = await params;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database uninitialized' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const via = typeof body.via === 'string' && ALLOWED_VIA.has(body.via) ? body.via : 'manual';

    const contactRef = adminDb
      .collection('users').doc(uid)
      .collection('contacts').doc(contactId);

    await contactRef.update({
      lastFollowedUpAt: new Date(),
      followedUpVia: via,
    });

    return NextResponse.json({ ok: true, via });
  } catch (err: any) {
    console.error('[Follow-up]', err);
    return NextResponse.json({ error: err.message || 'Follow-up update failed' }, { status: 500 });
  }
}
