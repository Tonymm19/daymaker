/**
 * One-off: set a list of users to Pro (or Free).
 *
 * Usage:  node scripts/set-plan.mjs pro <uid1> <uid2> ...
 *         node scripts/set-plan.mjs free <uid1>
 *
 * Reads FIREBASE_ADMIN_* from .env.local so it uses the same service account
 * as the deployed app.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Minimal .env.local loader — avoids a dotenv dependency.
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}

const [, , planArg, ...uids] = process.argv;
if (!['pro', 'free'].includes(planArg) || uids.length === 0) {
  console.error('Usage: node scripts/set-plan.mjs <pro|free> <uid> [uid...]');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

for (const uid of uids) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.warn(`[skip] ${uid}: user doc not found`);
    continue;
  }
  await ref.update({
    plan: planArg,
    stripeSubscriptionStatus: planArg === 'pro' ? 'active' : 'canceled',
    updatedAt: new Date(),
  });
  const after = (await ref.get()).data();
  console.log(`[ok]   ${uid}: plan=${after.plan} status=${after.stripeSubscriptionStatus}`);
}

process.exit(0);
