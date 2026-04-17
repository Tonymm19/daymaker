import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET');
      return NextResponse.json({ error: 'Webhook Secret Error' }, { status: 500 });
    }

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed.`, err.message);
      return NextResponse.json({ error: 'Webhook signature verification failed.' }, { status: 400 });
    }

    const { adminDb } = await import('@/lib/firebase/admin');
    if (!adminDb) {
      return NextResponse.json({ error: 'DB uninitialized' }, { status: 500 });
    }

    const usersRef = adminDb.collection('users');

    // Handle distinct subscription events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const uid = session.metadata?.firebaseUID;
        const subscriptionId = session.subscription;

        if (uid && subscriptionId) {
          await usersRef.doc(uid).update({
            plan: 'pro',
            stripeSubscriptionId: subscriptionId,
            updatedAt: new Date()
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        
        // Find user by customer ID
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const isPro = subscription.status === 'active' || subscription.status === 'trialing';
          
          await doc.ref.update({
            plan: isPro ? 'pro' : 'free',
            updatedAt: new Date()
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;

        // Find user by customer ID
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.update({
            plan: 'free',
            stripeSubscriptionId: null,
            updatedAt: new Date()
          });
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('Stripe Webhook Error:', error);
    return NextResponse.json({ error: 'Webhook configuration error' }, { status: 500 });
  }
}
