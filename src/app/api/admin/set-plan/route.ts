/**
 * DAYMAKER CONNECT — Admin: Set Plan (UNGATED)
 *
 * POST /api/admin/set-plan   { userId: string, plan: 'free' | 'pro' }
 *
 * Updates a user's Firestore doc with `plan` and (for 'pro') marks the
 * subscription status as 'active' so UI treats them as paid.
 *
 * ⚠ SECURITY: This route currently only requires a valid Firebase ID token —
 * any signed-in user can upgrade any userId. That's an explicit "for now"
 * choice; add a role/email allowlist before broader launch.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
      await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, plan } = body as { userId?: string; plan?: 'free' | 'pro' };

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    if (plan !== 'free' && plan !== 'pro') {
      return NextResponse.json({ error: "plan must be 'free' or 'pro'" }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await userRef.update({
      plan,
      stripeSubscriptionStatus: plan === 'pro' ? 'active' : 'canceled',
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, userId, plan });
  } catch (error: unknown) {
    console.error('[admin/set-plan] error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
