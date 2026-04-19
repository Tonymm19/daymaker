/**
 * DAYMAKER CONNECT — Contact Stats Helper (server-side)
 *
 * Keeps a small `contactStats` snapshot on the user doc so the dashboard stats
 * bar renders instantly without scanning every contact on each page load.
 *
 * - `recomputeContactStats` does a single projection scan (skipping the heavy
 *   `embedding` field) + one count aggregation. Use after bulk writes where
 *   the delta is hard to compute precisely (import, reset).
 * - `incrementContactStats` is a cheap field-increment. Use after categorize
 *   and embed batches where the delta is known.
 */

import type { Firestore } from 'firebase-admin/firestore';

type StatKey = 'total' | 'companies' | 'emails' | 'categorized' | 'embedded';

export async function recomputeContactStats(
  adminDb: Firestore,
  uid: string
): Promise<void> {
  const { Timestamp } = await import('firebase-admin/firestore');
  const contactsRef = adminDb.collection(`users/${uid}/contacts`);

  // `embedding` is 1,536 floats per doc — skip it in the projection and use a
  // count aggregation instead to avoid pulling ~50MB across the wire.
  const [embeddedCountSnap, projectionSnap] = await Promise.all([
    contactsRef.where('embedding', '!=', null).count().get(),
    contactsRef.select('company', 'email', 'categories').get(),
  ]);

  let total = 0;
  let emails = 0;
  let categorized = 0;
  const companySet = new Set<string>();

  for (const doc of projectionSnap.docs) {
    total++;
    const d = doc.data();
    if (typeof d.email === 'string' && d.email.includes('@')) emails++;
    if (Array.isArray(d.categories) && d.categories.length > 0) categorized++;
    if (typeof d.company === 'string' && d.company.trim()) {
      companySet.add(d.company.trim());
    }
  }

  await adminDb.doc(`users/${uid}`).update({
    contactStats: {
      total,
      categorized,
      embedded: embeddedCountSnap.data().count,
      emails,
      companies: companySet.size,
      updatedAt: Timestamp.now(),
    },
  });
}

export async function incrementContactStats(
  adminDb: Firestore,
  uid: string,
  delta: Partial<Record<StatKey, number>>
): Promise<void> {
  const { FieldValue, Timestamp } = await import('firebase-admin/firestore');
  const updates: Record<string, FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp> = {
    'contactStats.updatedAt': Timestamp.now(),
  };
  let hasDelta = false;
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === 'number' && v !== 0) {
      updates[`contactStats.${k}`] = FieldValue.increment(v);
      hasDelta = true;
    }
  }
  if (!hasDelta) return;
  await adminDb.doc(`users/${uid}`).update(updates);
}

export async function setContactStatField(
  adminDb: Firestore,
  uid: string,
  key: StatKey,
  value: number
): Promise<void> {
  const { Timestamp } = await import('firebase-admin/firestore');
  await adminDb.doc(`users/${uid}`).update({
    [`contactStats.${key}`]: value,
    'contactStats.updatedAt': Timestamp.now(),
  });
}
