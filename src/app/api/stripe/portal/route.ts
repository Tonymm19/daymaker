import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAuth } from 'firebase-admin/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    
    // Auth Validation
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!adminDb) {
      return NextResponse.json({ error: 'DB uninitialized' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Get Firebase user for customer ID
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found in DB' }, { status: 404 });
    }

    const userData = userSnap.data()!;
    const stripeCustomerId = userData.stripeCustomerId;

    if (!stripeCustomerId) {
      return NextResponse.json({ error: 'No active Stripe Customer mapping found. Upgrade via checkout first.' }, { status: 400 });
    }

    // Generate Portal Session
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });

  } catch (error: any) {
    console.error('Stripe Portal Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
