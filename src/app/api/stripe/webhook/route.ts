import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/** Map a Stripe Price ID to our two-tier cadence. Returns null when the
 *  Price ID is unknown (e.g. legacy $29 Price IDs from before April 2026,
 *  or test-mode IDs not configured in the current env). */
function cadenceForPriceId(priceId: string | undefined | null): 'monthly' | 'annual' | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return 'monthly';
  if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) return 'annual';
  return null;
}

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
        const sessionCadence: 'monthly' | 'annual' | null =
          session.metadata?.cadence === 'annual' ? 'annual'
          : session.metadata?.cadence === 'monthly' ? 'monthly'
          : null;

        if (uid && subscriptionId) {
          // Pull the full subscription so we can capture price + period end.
          let priceId: string | null = null;
          let periodEnd: number | null = null;
          let cadence: 'monthly' | 'annual' | null = sessionCadence;
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            priceId = sub.items.data[0]?.price?.id ?? null;
            periodEnd = (sub as any).current_period_end ?? null;
            cadence = cadenceForPriceId(priceId) ?? sessionCadence;
          } catch (err) {
            console.error('[stripe webhook] failed to retrieve subscription', err);
          }

          await usersRef.doc(uid).update({
            plan: 'pro',
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionStatus: 'active',
            stripePriceId: priceId,
            subscriptionCadence: cadence,
            subscriptionCurrentPeriodEnd: periodEnd ? Timestamp.fromMillis(periodEnd * 1000) : null,
            updatedAt: new Date()
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;

        // Find user by customer ID
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const isPro = subscription.status === 'active' || subscription.status === 'trialing';
          const priceId: string | null = subscription.items?.data?.[0]?.price?.id ?? null;
          const periodEnd: number | null = subscription.current_period_end ?? null;
          const cadence = cadenceForPriceId(priceId);

          await doc.ref.update({
            plan: isPro ? 'pro' : 'free',
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: subscription.status,
            stripePriceId: priceId,
            subscriptionCadence: cadence,
            subscriptionCurrentPeriodEnd: periodEnd ? Timestamp.fromMillis(periodEnd * 1000) : null,
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
            stripeSubscriptionStatus: 'canceled',
            stripePriceId: null,
            subscriptionCadence: null,
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
