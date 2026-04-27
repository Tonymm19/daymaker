/**
 * DAYMAKER CONNECT — Core Type Definitions
 *
 * Canonical types matching the Firestore data model.
 * All Firestore documents should serialize to/from these types.
 */

import type { Category, PlanType } from './brand.config';
import { type Timestamp } from 'firebase/firestore';

// ============================================
// Firestore Timestamp
// ============================================

/** Re-export Firebase Timestamp for convenience */
export type FirestoreTimestamp = Timestamp;

// ============================================
// User
// ============================================

export interface ContactStats {
  total: number;
  companies: number;
  emails: number;
  categorized: number;
  embedded: number;
  updatedAt: FirestoreTimestamp;
}

export interface DaymakerUser {
  uid: string;
  email: string;
  displayName: string;
  /** Base64 data URL for the user's profile picture (200x200 JPEG).
   *  Stored inline on the user doc to avoid Cloud Storage setup. */
  profilePhotoUrl?: string;
  plan: PlanType;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** The Stripe Price ID the active subscription is on. Compared against
   *  STRIPE_PRICE_ID_MONTHLY / STRIPE_PRICE_ID_ANNUAL to determine cadence. */
  stripePriceId?: string | null;
  /** Billing cadence the user picked at checkout. Saved by the webhook when
   *  the subscription is created or updated, so the UI can show "monthly"
   *  vs. "annual" without round-tripping to Stripe. */
  subscriptionCadence?: 'monthly' | 'annual' | null;
  /** Mirrors Stripe's subscription.status ('active' | 'trialing' | 'past_due'
   *  | 'canceled' | etc). Used by admin/set-plan and the billing UI. */
  stripeSubscriptionStatus?: string | null;
  /** End of the current paid period (renewal date for active, cutoff for
   *  canceled). Set from subscription.current_period_end (seconds). */
  subscriptionCurrentPeriodEnd?: FirestoreTimestamp | null;
  linkedInImportedAt: FirestoreTimestamp | null;
  contactCount: number;
  /** Cached aggregate counts for the stats bar. Refreshed on import/reset and
   *  incremented by categorize/embed so the dashboard can show stats without
   *  scanning the full contacts collection. */
  contactStats?: ContactStats;
  northStar: string;
  /** Up to 3 simultaneous North Star goals. Authoritative when non-empty;
   *  falls back to the single `northStar` field for users who haven't
   *  re-saved since multi-goal shipped. Use getNorthStarGoals() to read. */
  northStarGoals?: string[];
  /** Shorter-horizon goal: what the user is working toward right now and would
   *  accept an introduction to accelerate. Feeds into every AI prompt alongside
   *  the North Star. */
  currentGoal?: string;
  /** The kind of connection the user needs next — one of:
   *  'cofounder' | 'client' | 'investor' | 'collaborator' | 'mentor' | 'other'. */
  connectionType?: string;
  /** Short free-text answers collected on Profile to enrich AI prompts.
   *  Fed into query and Deep Dive prompts as additional user context. */
  onboardingAnswers?: OnboardingAnswers;
  /** contactIds the user has chosen to hide from all list views, AI results,
   *  and event attendee matching. Filtered in both the client and the server. */
  hiddenContacts?: string[];
  /** Calendar events and series the user has hidden from the upcoming events
   *  list. `instanceIds` suppress a single occurrence (e.g. one instance of a
   *  recurring meeting); `seriesIds` suppress an entire recurring series.
   *  Composite keys are `{source}:{id}` to avoid collisions between Google
   *  and Microsoft event IDs. Filtered client-side on fetch. */
  hiddenCalendarEvents?: {
    instanceIds?: string[];
    seriesIds?: string[];
  };
  rmConnected: boolean;
  rmPersonaTraits: string[];
  /** Reflections Match Bearer token. Server-side only — never returned in
   *  client-facing responses. Encrypted at rest when RM_KEY_ENCRYPTION_SECRET
   *  is set; stored plaintext otherwise. */
  rmApiKey?: string | null;
  rmNorthStar?: string | null;
  rmExpertise?: RmExpertiseArea[];
  rmActiveThemes?: RmActiveTheme[];
  rmStrategicContext?: string | null;
  rmTrackingInterests?: string[];
  rmLastSyncedAt?: FirestoreTimestamp | null;
  currentMonthQueries: number;
  currentMonthDeepDives: number;
  currentMonthEvents: number;
  currentMonthString: string;
  googleCalendarConnected: boolean;
  googleCalendarAccessToken: string | null;
  googleCalendarRefreshToken: string | null;
  microsoftCalendarConnected: boolean;
  microsoftCalendarAccessToken: string | null;
  microsoftCalendarRefreshToken: string | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface OnboardingAnswers {
  /** "What's the one thing you're trying to make happen in the next 90 days,
   *  and who would need to be in the room for it to move?" */
  ninetyDayGoal?: string;
  /** "What does a successful connection look like for you this month?" */
  successfulConnection?: string;
}

export interface RmExpertiseArea {
  area: string;
  depth: string;
  yearsOfExperience: number | null;
  context: string;
}

export interface RmActiveTheme {
  theme: string;
  strength: string;
  description: string;
}

export interface CreateUserInput {
  uid: string;
  email: string;
  displayName: string;
}

// ============================================
// Contact
// ============================================

export interface Contact {
  contactId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  position: string;
  email: string;
  linkedInUrl: string;
  connectedOn: FirestoreTimestamp | null;
  categories: Category[];
  embedding: number[] | null;
  embeddingText: string | null;
  lastUpdated: FirestoreTimestamp;
  previousCompany: string | null;
  previousPosition: string | null;
  importBatchId: string;
  searchText: string; // lowercase concatenation for client search
  conversationStarters?: string[];
  startersGeneratedAt?: FirestoreTimestamp | null;
  /** Latest time an analysis action (Deep Dive OR conversation starter
   *  generation) was taken against this contact. Feeds the "overdue
   *  follow-up" signal on contact lists. */
  lastAnalyzedAt?: FirestoreTimestamp | null;
  /** Latest time the user took an outreach action — manual mark, LinkedIn
   *  send, or sending a draft message. When >= lastAnalyzedAt, the contact
   *  is no longer considered overdue. */
  lastFollowedUpAt?: FirestoreTimestamp | null;
  followedUpVia?: 'manual' | 'linkedin' | 'draft-message';
}

export interface ParsedContact {
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  email: string;
  linkedInUrl: string;
  connectedOn: Date | null;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  batchId: string;
}

// ============================================
// AI Query
// ============================================

export interface QueryRequest {
  query: string;
  userId: string;
}

export interface QueryResponse {
  response: string;
  contactsReferenced: number;
  tokensUsed: number;
  ragUsed: boolean;
  durationMs: number;
}

export interface CategorizationResult {
  contactId: string;
  categories: Category[];
}

// ============================================
// Event Briefing
// ============================================

export interface EventBriefing {
  eventId: string;
  userId: string;
  eventName: string;
  eventDate: FirestoreTimestamp | null;
  eventLocation: string;
  attendees: EventAttendee[];
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface EventAttendee {
  name: string;
  company: string;
  position: string;
  relevanceScore: number; // 1-100
  isInNetwork: boolean;
  connectionType: 'anchor' | 'new' | 'must_meet' | 'worth_meeting';
  whyTheyMatter: string;
  conversationStarters: string[];
  networkGapAnalysis: string;
  followUpRecommendation: string;
  /** Set when the attendee matches a contact in the user's network, enabling Deep Dive. */
  contactId?: string;
  /** LinkedIn profile URL — from network match if available, otherwise a search URL. */
  linkedInUrl?: string;
  /** Profile photo URL if available (not yet populated by any pipeline). */
  photoUrl?: string;
}

// ============================================
// Deep Dive
// ============================================

export interface DeepDive {
  deepdiveId: string;
  userId: string;
  targetContactId: string;
  targetName: string;
  targetCompany: string;
  synergyScore: number; // 0-100 (alignment score; field kept for back-compat)
  mutualConnections: number;
  sharedCompanies: string[];
  topSynergies: SynergyArea[];
  actionItems: ActionItem[];
  rounds: DeepDiveRound[];
  executiveSummary: string;
  createdAt: FirestoreTimestamp;
  /** One-sentence plain-language explanation of what drove the score.
   *  Optional; pre-existing deep dives may not have it. */
  scoreSummary?: string;
  /** Factor breakdown surfaced in the expandable "Why this score?" section.
   *  Optional; weights sum to 100, contributions sum to roughly synergyScore. */
  scoreFactors?: AlignmentFactor[];
}

export interface AlignmentFactor {
  name: string;
  weight: number;       // percentage of total score this factor accounts for
  contribution: number; // points this factor actually earned (0..weight)
}

export interface SynergyArea {
  area: string;
  strength: 'high' | 'medium' | 'low';
  valueForUser: string;
  valueForTarget: string;
}

export interface ActionItem {
  forParty: 'user' | 'target';
  action: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DeepDiveRound {
  roundNumber: 1 | 2 | 3 | 4;
  title: string;
  userAgentMessage: string;
  targetAgentMessage: string;
}

// ============================================
// Monthly Briefing
// ============================================

export interface MonthlyBriefing {
  briefingId: string;
  userId: string;
  month: string; // "2026-03"
  generatedAt: FirestoreTimestamp;

  // Vital signs
  newConnections: number;
  totalNetwork: number;
  networkGrowthPercent: number;

  // Movement detection
  movements: NetworkMovement[];

  // Priority follow-ups
  followUps: FollowUpRecommendation[];

  // Cluster detection
  clusters: ConnectionCluster[];

  // Goal tracking
  goals: GoalProgress[];

  // Narrative sections (AI-generated markdown)
  introNarrative: string;
  summaryNarrative: string;

  // Explicit window labels for the "new connections" / "vs prev" framing.
  // Optional so pre-existing briefings (calendar-month math) still render
  // without a type error; the page falls back to generic copy when absent.
  currentWindowLabel?: string;
  previousWindowLabel?: string;
}

export interface NetworkMovement {
  contactId: string;
  contactName: string;
  movementType: 'company_change' | 'title_change' | 'acquisition';
  previousValue: string;
  currentValue: string;
  recommendation: string;
}

export interface FollowUpRecommendation {
  contactId: string;
  contactName: string;
  company: string;
  position: string;
  priority: 'high' | 'warm' | 'standard';
  insight: string;
  suggestedOpener: string;
  matchedGoals: string[];
}

export interface ConnectionCluster {
  name: string;
  description: string;
  contactCount: number;
  connectedDate: string;
  industry: string;
  contacts: { name: string; company: string }[];
}

export interface GoalProgress {
  goal: string;
  progressPercent: number;
  summary: string;
  keyContacts: string[];
}

// ============================================
// Usage Tracking
// ============================================

export interface UsageRecord {
  monthKey: string; // "2026-04"
  queryCount: number;
  lastQueryAt: FirestoreTimestamp;
  importCount: number;
  lastImportAt: FirestoreTimestamp | null;
}
