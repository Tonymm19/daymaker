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
  plan: PlanType;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  linkedInImportedAt: FirestoreTimestamp | null;
  contactCount: number;
  /** Cached aggregate counts for the stats bar. Refreshed on import/reset and
   *  incremented by categorize/embed so the dashboard can show stats without
   *  scanning the full contacts collection. */
  contactStats?: ContactStats;
  northStar: string;
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
  synergyScore: number; // 0-100
  mutualConnections: number;
  sharedCompanies: string[];
  topSynergies: SynergyArea[];
  actionItems: ActionItem[];
  rounds: DeepDiveRound[];
  executiveSummary: string;
  createdAt: FirestoreTimestamp;
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
