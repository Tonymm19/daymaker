/**
 * DAYMAKER CONNECT — Shared Constants
 *
 * Re-exports from brand.config and adds cross-feature constants
 * referenced by import pipeline, AI layer, and query system.
 */

import { BRAND } from './brand.config';
export type { Category, PlanType } from './brand.config';

/** The 13 canonical contact categories */
export const CATEGORIES = BRAND.categories;

/** Firestore batched write limit per commit */
export const FIRESTORE_BATCH_LIMIT = 500;

/** Contact count threshold: full-context below, RAG above */
export const RAG_THRESHOLD = 3000;

/** OpenAI text-embedding-3-small output dimensions */
export const EMBEDDING_DIMENSIONS = 1536;

/** Default number of contacts returned by RAG retrieval */
export const DEFAULT_TOP_K = 75;

/** Expanded top-K for broad queries */
export const BROAD_TOP_K = 150;

/** Max contacts per AI categorization batch */
export const CATEGORIZATION_BATCH_SIZE = 50;

/** Max contacts per embedding API call */
export const EMBEDDING_BATCH_SIZE = 100;

/** Free plan monthly query limit */
export const FREE_QUERY_LIMIT = BRAND.plans.free.queryLimit;

/** Free plan contact limit */
export const FREE_CONTACT_LIMIT = BRAND.plans.free.contactLimit;

/** Default Claude model */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';

/** Default embedding model */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Target max query response time in ms */
export const QUERY_TIMEOUT_MS = 8000;
