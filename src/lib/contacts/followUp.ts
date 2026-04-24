/**
 * Overdue-follow-up helper.
 *
 * A contact is overdue when:
 *   - they have a recorded analysis action (Deep Dive or conversation starter)
 *   - that action is more than FOLLOW_UP_WINDOW_DAYS old
 *   - AND the user has not logged a follow-up action since that analysis
 *
 * Contacts the user has never analyzed do NOT show as overdue — the whole
 * point is to surface places where the user asked Claude for a plan and then
 * never acted on it.
 */

import type { Contact, FirestoreTimestamp } from '@/lib/types';

export const FOLLOW_UP_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(ts: FirestoreTimestamp | null | undefined): number | null {
  if (!ts) return null;
  const anyTs = ts as any;
  if (typeof anyTs.toDate === 'function') {
    const d = anyTs.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null;
  }
  if (typeof anyTs.seconds === 'number') return anyTs.seconds * 1000;
  return null;
}

/** Returns true when the contact needs follow-up right now. */
export function isOverdue(contact: Contact, now: number = Date.now()): boolean {
  const analyzedMs = toMs(contact.lastAnalyzedAt) ?? toMs(contact.startersGeneratedAt);
  if (analyzedMs === null) return false;

  const ageMs = now - analyzedMs;
  if (ageMs < FOLLOW_UP_WINDOW_DAYS * DAY_MS) return false;

  const followedMs = toMs(contact.lastFollowedUpAt);
  if (followedMs !== null && followedMs >= analyzedMs) return false;

  return true;
}

/** Human-readable "N days ago" string for the overdue label. */
export function daysSinceAnalysis(contact: Contact, now: number = Date.now()): number | null {
  const analyzedMs = toMs(contact.lastAnalyzedAt) ?? toMs(contact.startersGeneratedAt);
  if (analyzedMs === null) return null;
  return Math.floor((now - analyzedMs) / DAY_MS);
}
