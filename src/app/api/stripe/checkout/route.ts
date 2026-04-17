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
    const email = decodedToken.email;

    if (!adminDb) {
      return NextResponse.json({ error: 'DB uninitialized' }, { status: 500 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!priceId) {
      return NextResponse.json({ error: 'STRIPE_PRICE_ID not set' }, { status: 500 });
    }

    // Get Firebase user
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found in DB' }, { status: 404 });
    }

    const userData = userSnap.data()!;
    let stripeCustomerId = userData.stripeCustomerId;

    // Create Stripe Customer if one does not exist
    if (!stripeCustomerId) {
      const stripe = getStripe();
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          firebaseUID: uid
        }
      });
      stripeCustomerId = customer.id;
      
      // Save it explicitly
      await userRef.update({
        stripeCustomerId: stripeCustomerId
      });
    }

    // Generate Checkout Session
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings`,
      metadata: {
        firebaseUID: uid,
      },
    });

    return NextResponse.json({ url: session.url });

  } catch (error: any) {
    console.error('Stripe Checkout Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
