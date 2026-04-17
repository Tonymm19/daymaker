import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.warn("STRIPE_SECRET_KEY is missing. Mocking for build.");
      _stripe = new Stripe('dummy', { apiVersion: '2026-03-25.dahlia' });
    } else {
      _stripe = new Stripe(key, {
        apiVersion: '2026-03-25.dahlia',
        appInfo: { name: 'Daymaker Connect', version: '0.1.0' },
      });
    }
  }
  return _stripe;
}
