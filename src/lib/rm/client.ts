/**
 * DAYMAKER CONNECT — Reflections Match Client
 *
 * Server-side helpers for calling the Reflections Match Twin Payload API
 * and extracting the fields Daymaker uses to enrich AI prompts.
 *
 * Do not import this from a client component — it assumes a Node runtime
 * and may read env vars / use crypto.
 */

import crypto from 'crypto';
import type { RmActiveTheme, RmExpertiseArea } from '@/lib/types';

export const RM_TWIN_ENDPOINT =
  'https://us-central1-reflections-match.cloudfunctions.net/getTwinPayload';

export interface RmTwinPayload {
  version?: string;
  tier?: string;
  identity?: {
    displayName?: string;
    headline?: string;
    traits?: {
      currentRole?: string;
      organization?: string;
      yearsInField?: number;
      primaryDomain?: string;
      industries?: string[];
      seniorityLevel?: string;
      coreTraits?: string[];
    };
    narrativeBio?: string;
    trackingInterests?: string[];
  };
  context?: {
    northStar?: string;
    creativeSpark?: string;
    trackingInterests?: string[];
    insightDigest?: {
      strategicSummary?: string;
      activeThemes?: RmActiveTheme[];
      emergingInterests?: string[];
      riskRadar?: string[];
      recommendedNextFocus?: string;
    };
    twinProfile?: {
      professionalIdentity?: Record<string, unknown>;
      expertiseAreas?: RmExpertiseArea[];
      strategicContext?: {
        northStar?: string;
        creativeSpark?: string;
        activeThemes?: string[];
        emergingInterests?: string[];
        riskBlindSpots?: string[];
      };
      workingStyle?: {
        archetype?: string;
        traits?: string[];
      };
      selfAssessment?: Record<string, unknown>;
    };
  };
  // Allow unknown extras so we don't break if RM extends the shape.
  [key: string]: unknown;
}

export interface ExtractedPersona {
  rmPersonaTraits: string[];
  rmNorthStar: string;
  rmExpertise: RmExpertiseArea[];
  rmActiveThemes: RmActiveTheme[];
  rmStrategicContext: string;
  rmTrackingInterests: string[];
  tier: string;
  displayName: string;
  headline: string;
}

export class RmApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchTwinPayload(apiKey: string): Promise<RmTwinPayload> {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new RmApiError('Missing Reflections Match API key', 400);
  }
  const res = await fetch(RM_TWIN_ENDPOINT, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    // Don't reuse a cached response across users.
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new RmApiError(
      `Reflections Match returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      res.status === 401 || res.status === 403 ? 401 : 502,
    );
  }
  const data = (await res.json()) as RmTwinPayload;
  if (!data || typeof data !== 'object') {
    throw new RmApiError('Reflections Match returned an unexpected payload', 502);
  }
  return data;
}

export function extractPersona(payload: RmTwinPayload): ExtractedPersona {
  const identity = payload.identity || {};
  const context = payload.context || {};
  const twin = context.twinProfile || {};
  const digest = context.insightDigest || {};

  // Core traits for the chip row. Prefer working-style traits (short adjectives
  // ideal for tag display); fall back to coreTraits on older payload shapes.
  const personaTraits =
    twin.workingStyle?.traits
    ?? identity.traits?.coreTraits
    ?? [];

  const northStar = context.northStar ?? twin.strategicContext?.northStar ?? '';

  const expertise = Array.isArray(twin.expertiseAreas) ? twin.expertiseAreas : [];

  const activeThemes = Array.isArray(digest.activeThemes) ? digest.activeThemes : [];

  // Flatten strategicContext to a single prompt-friendly string. The prompt
  // pipeline is stricter than the UI about shape, so we store a rendered
  // version here rather than the raw object.
  const sc = twin.strategicContext || {};
  const scLines: string[] = [];
  if (sc.northStar) scLines.push(`North Star: ${sc.northStar}`);
  if (sc.creativeSpark) scLines.push(`Creative Spark: ${sc.creativeSpark}`);
  if (sc.activeThemes?.length) scLines.push(`Active themes: ${sc.activeThemes.join(', ')}`);
  if (sc.emergingInterests?.length) scLines.push(`Emerging interests: ${sc.emergingInterests.join(', ')}`);
  if (sc.riskBlindSpots?.length) scLines.push(`Risk blind spots: ${sc.riskBlindSpots.join(', ')}`);
  const strategicContext = scLines.join(' • ');

  const trackingInterests =
    (Array.isArray(context.trackingInterests) && context.trackingInterests)
    || (Array.isArray(identity.trackingInterests) && identity.trackingInterests)
    || [];

  return {
    rmPersonaTraits: personaTraits,
    rmNorthStar: northStar,
    rmExpertise: expertise,
    rmActiveThemes: activeThemes,
    rmStrategicContext: strategicContext,
    rmTrackingInterests: trackingInterests,
    tier: typeof payload.tier === 'string' ? payload.tier : 'context',
    displayName: identity.displayName || '',
    headline: identity.headline || '',
  };
}

// ============================================================================
// Optional encryption at rest
// ============================================================================

const ENCRYPTION_PREFIX = 'rmk1:';

function getEncryptionKey(): Buffer | null {
  const raw = process.env.RM_KEY_ENCRYPTION_SECRET;
  if (!raw) return null;
  // Accept either a 64-char hex string or any string — derive 32 bytes via sha256.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    // No secret configured — return as-is. The field is still only readable
    // server-side via the admin SDK. Log once so prod deploys can catch this.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[RM] RM_KEY_ENCRYPTION_SECRET is not set; storing RM API key in plaintext.');
    }
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENCRYPTION_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptApiKey(stored: string): string {
  if (!stored.startsWith(ENCRYPTION_PREFIX)) return stored; // plaintext fallback
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('RM API key is encrypted but RM_KEY_ENCRYPTION_SECRET is not configured');
  }
  const payload = Buffer.from(stored.slice(ENCRYPTION_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
