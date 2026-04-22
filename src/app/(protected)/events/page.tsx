'use client';

/**
 * DAYMAKER CONNECT — Events Page with Multi-Calendar Integration + Smart URL Detection
 *
 * Features:
 * - Google Calendar + Microsoft Outlook Calendar (read-only)
 * - Independent connection status per provider  
 * - Merged, date-sorted event feed with source badges
 * - Smart URL detection in event descriptions (Luma, Eventbrite)
 * - Luma attendee import via public page scraping
 * - Pre-populated briefing forms from calendar event data
 * - Manual event creation with attendee text/CSV input
 */

import { useState, useRef, FormEvent, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useUser } from '@/lib/hooks/useUser';
import { getDb } from '@/lib/firebase/config';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { getAuth } from '@/lib/firebase/config';
import Modal from '@/components/ui/Modal';
import Papa from 'papaparse';
import type { EventBriefing } from '@/lib/types';
import UpgradeCard from '@/components/ui/UpgradeCard';

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  attendees: { name: string; email: string; responseStatus: string }[];
  isAllDay: boolean;
  htmlLink: string;
  source: 'google' | 'microsoft';
  /** For recurring events, the ID of the series master. Null for one-offs. */
  seriesId?: string | null;
}

/** A CalendarEvent after collapse — if the raw feed had multiple instances of
 *  the same recurring series, they're folded into one row here. `occurrences`
 *  is the full list of underlying instances (sorted ascending by startTime);
 *  the top-level fields mirror the next/earliest occurrence for display. */
interface CollapsedCalendarEvent extends CalendarEvent {
  occurrences: CalendarEvent[];
  isRecurring: boolean;
}

interface DetectedUrls {
  luma: string | null;
  eventbrite: string | null;
}

interface LumaScrapedData {
  eventTitle: string | null;
  eventDescription: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  hosts: string[];
  attendees: { name: string; company?: string; title?: string }[];
  attendeeCount: number | null;
  lumaUrl: string;
}

interface EventbriteScrapedData {
  eventTitle: string | null;
  eventDescription: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  hosts: string[];
  attendees: { name: string; company?: string; title?: string }[];
  eventbriteUrl: string;
}

// Phase labels shown while /api/events/prebrief is running. Phases advance
// on a timer, not real progress signals — the backend is a single batched
// request.
const BRIEFING_PHASE_LABELS = [
  'Analyzing attendees...',
  'Cross-referencing with your network...',
  'Generating conversation starters...',
];

// ─── Recurring Event Collapse ──────────────────────────────────────
// Google and Microsoft both expand recurring events into individual instances
// in their feeds, which clutters the upcoming events list (e.g. showing a
// weekly team meeting 4 times in a month). This folds instances back into
// one row per series. Grouping key preference:
//   1. seriesId (server-provided recurringEventId / seriesMasterId)
//   2. fallback: title + source + location — catches cases where the
//      provider didn't give us a seriesId but the rows are obviously the
//      same meeting
// The surviving row represents the next (earliest) occurrence; all instances
// are kept on `occurrences` so hide-one-instance can target the right row.
function collapseRecurring(events: CalendarEvent[]): CollapsedCalendarEvent[] {
  const groups = new Map<string, CalendarEvent[]>();

  for (const ev of events) {
    const key = ev.seriesId
      ? `${ev.source}:series:${ev.seriesId}`
      : `${ev.source}:title:${ev.title.trim().toLowerCase()}|${(ev.location || '').trim().toLowerCase()}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(ev);
    else groups.set(key, [ev]);
  }

  const collapsed: CollapsedCalendarEvent[] = [];
  for (const bucket of groups.values()) {
    // Title-based fallback is intentionally lenient — but don't collapse
    // rows unless there's an actual series hint OR there are 2+ matches.
    // A single one-off event with no seriesId should remain uncollapsed.
    bucket.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const first = bucket[0];
    const isRecurring = bucket.length > 1 || Boolean(first.seriesId);
    collapsed.push({
      ...first,
      occurrences: bucket,
      isRecurring,
    });
  }

  collapsed.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return collapsed;
}

// Composite key so Google event id "abc123" can't accidentally suppress a
// Microsoft event with the same id.
function hideKey(source: 'google' | 'microsoft', id: string): string {
  return `${source}:${id}`;
}

// ─── URL Detection ─────────────────────────────────────────────────
function detectEventUrls(text: string | null): DetectedUrls {
  if (!text) return { luma: null, eventbrite: null };

  // Match Luma URLs: lu.ma/xxx or luma.com/xxx
  const lumaMatch = text.match(/https?:\/\/(?:lu\.ma|(?:www\.)?luma\.com)\/[^\s<>"')\]]+/i);

  // Match Eventbrite URLs
  const eventbriteMatch = text.match(/https?:\/\/(?:www\.)?eventbrite\.com\/[^\s<>"')\]]+/i);

  return {
    luma: lumaMatch ? lumaMatch[0].replace(/[.,;!?)]+$/, '') : null,
    eventbrite: eventbriteMatch ? eventbriteMatch[0].replace(/[.,;!?)]+$/, '') : null,
  };
}

// ─── SVG Icon Components ──────────────────────────────────────────────
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5.26 9.76A7 7 0 0118.68 8H21.85" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.74 14.24A7 7 0 015.32 16H2.15" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
      <rect x="7" y="7" width="10" height="10" rx="1" stroke="#EA4335" strokeWidth="1.5" />
      <line x1="7" y1="10" x2="17" y2="10" stroke="#FBBC05" strokeWidth="1.5" />
      <line x1="10" y1="7" x2="10" y2="17" stroke="#4285F4" strokeWidth="1.5" opacity="0.5" />
      <line x1="14" y1="7" x2="14" y2="17" stroke="#4285F4" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

function MicrosoftIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="1" fill="#F25022" />
      <rect x="13" y="2" width="9" height="9" rx="1" fill="#7FBA00" />
      <rect x="2" y="13" width="9" height="9" rx="1" fill="#00A4EF" />
      <rect x="13" y="13" width="9" height="9" rx="1" fill="#FFB900" />
    </svg>
  );
}

function SourceBadge({ source }: { source: 'google' | 'microsoft' }) {
  return (
    <span title={source === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
        borderRadius: '4px', fontSize: '11px', fontWeight: 600,
        background: source === 'google' ? 'rgba(66, 133, 244, 0.12)' : 'rgba(0, 164, 239, 0.12)',
        color: source === 'google' ? '#60A5FA' : '#00A4EF',
      }}>
      {source === 'google' ? <GoogleIcon size={12} /> : <MicrosoftIcon size={12} />}
      {source === 'google' ? 'Google' : 'Outlook'}
    </span>
  );
}

// ─── Luma/Eventbrite URL badges on event cards ──────────────────────
function EventUrlBadges({ urls }: { urls: DetectedUrls }) {
  if (!urls.luma && !urls.eventbrite) return null;
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      {urls.luma && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
          borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px',
          background: 'rgba(255, 107, 107, 0.12)', color: '#FF6B6B',
        }}>
          🎪 Luma Event
        </span>
      )}
      {urls.eventbrite && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
          borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px',
          background: 'rgba(244, 141, 54, 0.12)', color: '#F48D36',
        }}>
          🎟 Eventbrite
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function EventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { userDoc, mutate: mutateUser } = useUser();
  const [events, setEvents] = useState<EventBriefing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Hide-related state. When the user clicks the X on a recurring event we
  // show a small chooser modal (hide this instance vs hide the series);
  // one-off events hide immediately. `hiddenInstances` and `hiddenSeries`
  // are Sets derived from the user doc for O(1) filter lookups.
  const [hideTarget, setHideTarget] = useState<CollapsedCalendarEvent | null>(null);
  const [hiding, setHiding] = useState(false);
  const [showHiddenPanel, setShowHiddenPanel] = useState(false);

  // Past briefings panel starts collapsed. Users click "Past Briefings
  // (N)" to expand, same pattern as the Hidden events panel.
  const [showPastBriefings, setShowPastBriefings] = useState(false);

  // Per-briefing delete: `briefingToDelete` drives the confirm modal,
  // `deletingBriefing` blocks double-submits during the Firestore write.
  const [briefingToDelete, setBriefingToDelete] = useState<EventBriefing | null>(null);
  const [deletingBriefing, setDeletingBriefing] = useState(false);

  // Calendar connection state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // Briefing modal state
  const [showModal, setShowModal] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const [attendeeText, setAttendeeText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Filter state for CSV uploads that have a status column.
  // null when no CSV uploaded with status, or CSV had no recognized
  // status column.
  const [uploadedCsvRows, setUploadedCsvRows] = useState<Record<string, string>[] | null>(null);
  const [statusColumn, setStatusColumn] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [showFilterExpanded, setShowFilterExpanded] = useState(false);

  // Smart URL detection state
  const [detectedUrls, setDetectedUrls] = useState<DetectedUrls>({ luma: null, eventbrite: null });
  const [lumaLoading, setLumaLoading] = useState(false);
  const [lumaData, setLumaData] = useState<LumaScrapedData | null>(null);
  const [lumaError, setLumaError] = useState('');
  const [showLumaPreview, setShowLumaPreview] = useState(false);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [eventbriteData, setEventbriteData] = useState<EventbriteScrapedData | null>(null);
  const [eventbriteError, setEventbriteError] = useState('');
  const [showEventbritePreview, setShowEventbritePreview] = useState(false);

  // Phased progress for briefing generation — advances on a timer, not real
  // progress signals. Labels match user expectations for each stage.
  const [phaseIndex, setPhaseIndex] = useState(0);

  // Plan-limit error for event briefings (Pro-only on free tier)
  const [limitReached, setLimitReached] = useState<{ message: string; upgradeUrl: string } | null>(null);

  // Organizer outreach draft modal
  const [showOrganizerModal, setShowOrganizerModal] = useState(false);
  const [organizerSubject, setOrganizerSubject] = useState('');
  const [organizerBody, setOrganizerBody] = useState('');
  const [organizerCopied, setOrganizerCopied] = useState(false);

  // Source calendar event for the modal (null = manual creation)
  const [sourceCalendarEvent, setSourceCalendarEvent] = useState<CalendarEvent | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const anyCalendarConnected = googleConnected || microsoftConnected;

  // ─── Hide filters ────────────────────────────────────────────────
  // Derived once per render from the user doc. Sets give O(1) lookups when
  // filtering potentially dozens of calendar events.
  const hiddenInstances = useMemo(
    () => new Set(userDoc?.hiddenCalendarEvents?.instanceIds || []),
    [userDoc?.hiddenCalendarEvents?.instanceIds]
  );
  const hiddenSeries = useMemo(
    () => new Set(userDoc?.hiddenCalendarEvents?.seriesIds || []),
    [userDoc?.hiddenCalendarEvents?.seriesIds]
  );

  // The upcoming events list the user actually sees: calendar feed, minus
  // hidden individual instances, minus hidden whole series, then collapsed
  // so recurring meetings show as a single row.
  const visibleEvents = useMemo(() => {
    const kept = calendarEvents.filter((ev) => {
      if (hiddenInstances.has(hideKey(ev.source, ev.id))) return false;
      if (ev.seriesId && hiddenSeries.has(hideKey(ev.source, ev.seriesId))) return false;
      return true;
    });
    return collapseRecurring(kept);
  }, [calendarEvents, hiddenInstances, hiddenSeries]);

  // Events the user has hidden, reconstructed from the raw feed for the
  // "Hidden events" management panel. These keep their original composite
  // hide keys so the Unhide button can remove the exact match.
  const hiddenEventsList = useMemo(() => {
    return calendarEvents
      .filter((ev) => {
        if (hiddenInstances.has(hideKey(ev.source, ev.id))) return true;
        if (ev.seriesId && hiddenSeries.has(hideKey(ev.source, ev.seriesId))) return true;
        return false;
      })
      .map((ev) => {
        const isSeriesHide = Boolean(
          ev.seriesId && hiddenSeries.has(hideKey(ev.source, ev.seriesId))
        );
        return {
          event: ev,
          hideType: isSeriesHide ? ('series' as const) : ('instance' as const),
          hideIdKey: isSeriesHide
            ? hideKey(ev.source, ev.seriesId!)
            : hideKey(ev.source, ev.id),
        };
      });
  }, [calendarEvents, hiddenInstances, hiddenSeries]);

  // Dedupe the "Hidden events" panel — a hidden series will match every
  // instance of itself in the feed, so show the series once.
  const hiddenEventsDisplay = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof hiddenEventsList = [];
    for (const h of hiddenEventsList) {
      if (seen.has(h.hideIdKey)) continue;
      seen.add(h.hideIdKey);
      out.push(h);
    }
    return out;
  }, [hiddenEventsList]);

  // Split saved briefings into upcoming vs past based on event date.
  // A briefing where eventDate < start of today is "past". Briefings
  // with a missing or malformed eventDate are treated as upcoming to
  // avoid silently hiding content we can't date-check.
  const { upcomingBriefings, pastBriefings } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming: EventBriefing[] = [];
    const past: EventBriefing[] = [];
    for (const ev of events) {
      const seconds = (ev.eventDate as any)?.seconds;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
        upcoming.push(ev);
        continue;
      }
      const eventDate = new Date(seconds * 1000);
      if (eventDate >= startOfToday) {
        upcoming.push(ev);
      } else {
        past.push(ev);
      }
    }
    return { upcomingBriefings: upcoming, pastBriefings: past };
  }, [events]);

  // ─── Hide / Unhide actions ───────────────────────────────────────
  // All writes use arrayUnion/arrayRemove on nested map fields, which
  // Firestore supports with dot-path updates. We mutate SWR optimistically
  // by calling mutateUser() after the write commits.
  const persistHide = useCallback(
    async (kind: 'instance' | 'series', key: string, remove = false) => {
      if (!user?.uid) return;
      const db = getDb();
      if (!db) return;
      const field =
        kind === 'instance'
          ? 'hiddenCalendarEvents.instanceIds'
          : 'hiddenCalendarEvents.seriesIds';
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          [field]: remove ? arrayRemove(key) : arrayUnion(key),
        });
        mutateUser();
      } catch (err) {
        console.error(`Failed to ${remove ? 'unhide' : 'hide'} calendar ${kind}:`, err);
      }
    },
    [user?.uid, mutateUser]
  );

  const handleHideClick = useCallback((ev: CollapsedCalendarEvent) => {
    // Recurring events (series or multiple matched occurrences) get the
    // chooser modal; one-offs hide immediately.
    if (ev.isRecurring) {
      setHideTarget(ev);
    } else {
      void persistHide('instance', hideKey(ev.source, ev.id));
    }
  }, [persistHide]);

  const confirmHideInstance = useCallback(async () => {
    if (!hideTarget) return;
    setHiding(true);
    await persistHide('instance', hideKey(hideTarget.source, hideTarget.id));
    setHiding(false);
    setHideTarget(null);
  }, [hideTarget, persistHide]);

  const confirmHideSeries = useCallback(async () => {
    if (!hideTarget) return;
    setHiding(true);
    // Prefer the real seriesId when available. For title-fallback-only
    // groups (no server seriesId), hide every instance in the bucket so
    // the whole visible series disappears.
    if (hideTarget.seriesId) {
      await persistHide('series', hideKey(hideTarget.source, hideTarget.seriesId));
    } else {
      for (const occ of hideTarget.occurrences) {
        await persistHide('instance', hideKey(occ.source, occ.id));
      }
    }
    setHiding(false);
    setHideTarget(null);
  }, [hideTarget, persistHide]);

  const handleUnhide = useCallback(
    (kind: 'instance' | 'series', key: string) => {
      void persistHide(kind, key, true);
    },
    [persistHide]
  );

  // ─── Delete briefing ─────────────────────────────────────────────
  // Permanent removal of a saved Event Briefing. Writes to Firestore
  // first, then updates local state so the list re-renders. No soft
  // delete / archive; a deleted briefing is gone.
  const confirmDeleteBriefing = useCallback(async () => {
    if (!briefingToDelete || !user?.uid) return;
    setDeletingBriefing(true);
    try {
      const db = getDb();
      if (!db) throw new Error('Firestore unavailable');
      await deleteDoc(doc(db, 'users', user.uid, 'events', briefingToDelete.eventId));
      setEvents(events.filter(e => e.eventId !== briefingToDelete.eventId));
      setBriefingToDelete(null);
    } catch (err) {
      console.error('Failed to delete briefing:', err);
      alert('Failed to delete briefing. Please try again.');
    } finally {
      setDeletingBriefing(false);
    }
  }, [briefingToDelete, user?.uid, events]);


  // ─── URL param handling ───────────────────────────────────────────
  useEffect(() => {
    const calConnected = searchParams.get('calendar_connected');
    const calError = searchParams.get('calendar_error');
    if (calConnected === 'true') { setGoogleConnected(true); router.replace('/events', { scroll: false }); }
    if (calConnected === 'microsoft') { setMicrosoftConnected(true); router.replace('/events', { scroll: false }); }
    if (calError) { setCalendarError(decodeURIComponent(calError)); router.replace('/events', { scroll: false }); }
  }, [searchParams, router]);

  // ─── Auth token helper ────────────────────────────────────────────
  const getIdToken = useCallback(async (): Promise<string | null> => {
    const auth = getAuth();
    if (!auth?.currentUser) return null;
    try { return await auth.currentUser.getIdToken(); } catch { return null; }
  }, []);

  // ─── Check calendar status from Firestore ─────────────────────────
  useEffect(() => {
    async function checkCalendarStatus() {
      if (!user?.uid) return;
      try {
        const db = getDb();
        if (!db) return;
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setGoogleConnected(data.googleCalendarConnected === true);
          setMicrosoftConnected(data.microsoftCalendarConnected === true);
        }
      } catch (err) { console.error('Failed to check calendar status', err); }
    }
    checkCalendarStatus();
  }, [user]);

  // ─── Load saved briefings ─────────────────────────────────────────
  useEffect(() => {
    async function loadEvents() {
      if (!user?.uid) return;
      try {
        const db = getDb();
        if (!db) return;
        const snap = await getDocs(query(collection(db, 'users', user.uid, 'events'), orderBy('createdAt', 'desc')));
        const loaded: EventBriefing[] = [];
        snap.forEach(d => loaded.push(d.data() as EventBriefing));
        setEvents(loaded);
      } catch (err) { console.error("Failed to load events", err); }
      finally { setIsLoading(false); }
    }
    loadEvents();
  }, [user]);

  // ─── Fetch & merge calendar events ────────────────────────────────
  const fetchCalendarEvents = useCallback(async () => {
    if (!googleConnected && !microsoftConnected) return;
    setCalendarLoading(true);
    const allEvents: CalendarEvent[] = [];
    try {
      const token = await getIdToken();
      if (!token) return;
      if (googleConnected) {
        try {
          const res = await fetch('/api/calendar/events', { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          if (res.ok && data.events) allEvents.push(...data.events.map((e: CalendarEvent) => ({ ...e, source: 'google' as const })));
          else if (data.needsReconnect) setGoogleConnected(false);
        } catch (err) { console.error('Google calendar fetch failed:', err); }
      }
      if (microsoftConnected) {
        try {
          const res = await fetch('/api/calendar/microsoft/events', { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          if (res.ok && data.events) allEvents.push(...data.events.map((e: CalendarEvent) => ({ ...e, source: 'microsoft' as const })));
          else if (data.needsReconnect) setMicrosoftConnected(false);
        } catch (err) { console.error('Microsoft calendar fetch failed:', err); }
      }
      allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setCalendarEvents(allEvents);
      setCalendarError('');
    } catch (err) { console.error('Failed to fetch calendar events:', err); setCalendarError('Failed to load calendar events'); }
    finally { setCalendarLoading(false); }
  }, [googleConnected, microsoftConnected, getIdToken]);

  useEffect(() => { fetchCalendarEvents(); }, [fetchCalendarEvents]);

  // Walk briefing-generation phase labels: 0 → 1 at 5s, 1 → 2 at 15s.
  useEffect(() => {
    if (!isGenerating) {
      setPhaseIndex(0);
      return;
    }
    const t1 = setTimeout(() => setPhaseIndex(1), 5000);
    const t2 = setTimeout(() => setPhaseIndex(2), 15000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isGenerating]);

  // ─── Connect / Disconnect handlers ────────────────────────────────
  const handleConnectGoogle = async () => {
    const token = await getIdToken();
    if (!token) { setCalendarError('Not authenticated. Please sign in again.'); return; }
    window.location.href = `/api/calendar/connect?token=${encodeURIComponent(token)}`;
  };
  const handleConnectMicrosoft = async () => {
    const token = await getIdToken();
    if (!token) { setCalendarError('Not authenticated. Please sign in again.'); return; }
    window.location.href = `/api/calendar/microsoft/connect?token=${encodeURIComponent(token)}`;
  };
  const handleDisconnectGoogle = async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch('/api/calendar/disconnect', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) { setGoogleConnected(false); setCalendarEvents(prev => prev.filter(e => e.source !== 'google')); }
    } catch (err) { console.error('Failed to disconnect Google calendar:', err); }
  };
  const handleDisconnectMicrosoft = async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch('/api/calendar/microsoft/disconnect', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) { setMicrosoftConnected(false); setCalendarEvents(prev => prev.filter(e => e.source !== 'microsoft')); }
    } catch (err) { console.error('Failed to disconnect Microsoft calendar:', err); }
  };

  // ─── Smart Pre-Brief from Calendar Event ──────────────────────────
  const handleCalendarEventPreBrief = (calEvent: CalendarEvent) => {
    // Reset modal state
    setGenerateError('');
    setLumaData(null);
    setLumaError('');
    setShowLumaPreview(false);
    setEventbriteData(null);
    setEventbriteError('');
    setShowEventbritePreview(false);
    setSourceCalendarEvent(calEvent);

    // Auto-populate form fields from calendar data
    setEventName(calEvent.title);
    if (calEvent.startTime) {
      const d = new Date(calEvent.startTime);
      setEventDate(d.toISOString().split('T')[0]);
    }
    setEventLocation(calEvent.location || '');
    setEventDescription(calEvent.description || '');

    // Pre-fill attendees from calendar
    const attendeeLines = calEvent.attendees
      .filter(a => a.email)
      .map(a => a.name || a.email.split('@')[0])
      .join('\n');
    setAttendeeText(attendeeLines);

    // Detect Luma/Eventbrite URLs in the description
    const urls = detectEventUrls(calEvent.description);
    setDetectedUrls(urls);

    setShowModal(true);
  };

  // Manual creation — clear everything
  const handleManualCreate = () => {
    setSourceCalendarEvent(null);
    setEventName('');
    setEventDate('');
    setEventLocation('');
    setEventDescription('');
    setAttendeeText('');
    setDetectedUrls({ luma: null, eventbrite: null });
    setLumaData(null);
    setLumaError('');
    setShowLumaPreview(false);
    setEventbriteData(null);
    setEventbriteError('');
    setShowEventbritePreview(false);
    setGenerateError('');
    setShowModal(true);
  };

  // ─── Luma Scraper ─────────────────────────────────────────────────
  const handleImportFromLuma = async () => {
    if (!detectedUrls.luma) return;
    setLumaLoading(true);
    setLumaError('');
    setLumaData(null);

    try {
      const token = await getIdToken();
      if (!token) { setLumaError('Not authenticated'); setLumaLoading(false); return; }

      const res = await fetch('/api/luma/scrape-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: detectedUrls.luma }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to scrape Luma page');

      const scraped: LumaScrapedData = data.data;
      setLumaData(scraped);

      // Enrich form with scraped data (don't overwrite user edits for name/date/location)
      if (!eventName && scraped.eventTitle) setEventName(scraped.eventTitle);
      if (!eventLocation && scraped.eventLocation) setEventLocation(scraped.eventLocation);
      if (!eventDate && scraped.eventDate) {
        try {
          const d = new Date(scraped.eventDate);
          setEventDate(d.toISOString().split('T')[0]);
        } catch { /* skip */ }
      }
      if (scraped.eventDescription && !eventDescription) {
        setEventDescription(scraped.eventDescription);
      }

      // Build attendee list from scraped data
      const scrapedAttendees: string[] = [];

      // Add hosts
      for (const host of scraped.hosts) {
        scrapedAttendees.push(`${host}, , Host`);
      }

      // Add attendees/speakers
      for (const att of scraped.attendees) {
        const parts = [att.name, att.company || '', att.title || ''].filter(Boolean);
        scrapedAttendees.push(parts.join(', '));
      }

      if (scrapedAttendees.length > 0) {
        // Merge with existing attendees (avoid duplicates)
        const existingNames = new Set(
          attendeeText.split('\n').map(l => l.split(',')[0].trim().toLowerCase()).filter(Boolean)
        );
        const newAttendees = scrapedAttendees.filter(
          line => !existingNames.has(line.split(',')[0].trim().toLowerCase())
        );

        if (newAttendees.length > 0) {
          const merged = attendeeText ? `${attendeeText}\n${newAttendees.join('\n')}` : newAttendees.join('\n');
          setAttendeeText(merged);
        }
      }

      setShowLumaPreview(true);
    } catch (err: any) {
      console.error('Luma import failed:', err);
      setLumaError(err.message || 'Failed to import from Luma');
    } finally {
      setLumaLoading(false);
    }
  };

  // ─── Eventbrite Scraper ───────────────────────────────────────────
  const handleImportFromEventbrite = async () => {
    if (!detectedUrls.eventbrite) return;
    setEventbriteLoading(true);
    setEventbriteError('');
    setEventbriteData(null);

    try {
      const token = await getIdToken();
      if (!token) { setEventbriteError('Not authenticated'); setEventbriteLoading(false); return; }

      const res = await fetch('/api/eventbrite/scrape-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: detectedUrls.eventbrite }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to scrape Eventbrite page');

      const scraped: EventbriteScrapedData = data.data;
      setEventbriteData(scraped);

      // Enrich form (don't overwrite user edits)
      if (!eventName && scraped.eventTitle) setEventName(scraped.eventTitle);
      if (!eventLocation && scraped.eventLocation) setEventLocation(scraped.eventLocation);
      if (!eventDate && scraped.eventDate) {
        try {
          const d = new Date(scraped.eventDate);
          setEventDate(d.toISOString().split('T')[0]);
        } catch { /* skip */ }
      }
      if (!eventDescription && scraped.eventDescription) setEventDescription(scraped.eventDescription);

      // Merge scraped hosts + speakers into the attendee list
      const scrapedAttendees: string[] = [];
      for (const host of scraped.hosts) scrapedAttendees.push(`${host}, , Host`);
      for (const att of scraped.attendees) {
        const parts = [att.name, att.company || '', att.title || ''].filter(Boolean);
        scrapedAttendees.push(parts.join(', '));
      }
      if (scrapedAttendees.length > 0) {
        const existingNames = new Set(
          attendeeText.split('\n').map(l => l.split(',')[0].trim().toLowerCase()).filter(Boolean)
        );
        const newAttendees = scrapedAttendees.filter(
          line => !existingNames.has(line.split(',')[0].trim().toLowerCase())
        );
        if (newAttendees.length > 0) {
          const merged = attendeeText ? `${attendeeText}\n${newAttendees.join('\n')}` : newAttendees.join('\n');
          setAttendeeText(merged);
        }
      }

      setShowEventbritePreview(true);
    } catch (err: any) {
      console.error('Eventbrite import failed:', err);
      setEventbriteError(err.message || 'Failed to import from Eventbrite');
    } finally {
      setEventbriteLoading(false);
    }
  };

  // ─── File upload ──────────────────────────────────────────────────

  // Status column detection candidates (case-insensitive, whitespace/
  // underscore tolerant — matches approval_status, RSVP Status, etc.)
  const STATUS_COLUMN_CANDIDATES = [
    'approval_status', 'rsvp_status', 'status', 'attendance', 'attending',
  ];

  // Status values that mean "this person will be there" — the default
  // selected set when the filter auto-applies.
  const APPROVED_STATUSES = new Set([
    'approved', 'confirmed', 'registered', 'yes', 'going', 'attending', 'checked_in',
  ]);

  // Company field name patterns — used as fallback after explicit
  // candidates miss. Matches Luma-style custom questions like
  // "What organization do you represent?".
  const COMPANY_HEURISTIC_SUBSTRINGS = ['organization', 'company', 'firm', 'employer'];

  // Title/role field name patterns — fallback for Luma "primary role"
  // and similar custom questions.
  const TITLE_HEURISTIC_SUBSTRINGS = ['primary role', 'your role', 'role in', 'position', 'job title'];

  // Detect status column in parsed rows. Returns the actual column
  // name (preserving original casing) or null.
  function detectStatusColumn(rows: Record<string, string>[]): string | null {
    if (rows.length === 0) return null;
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
    const candidates = STATUS_COLUMN_CANDIDATES.map(normalize);
    for (const key of Object.keys(rows[0])) {
      if (candidates.includes(normalize(key))) return key;
    }
    return null;
  }

  // Count each status value across all rows. Skips empty statuses.
  function countStatuses(rows: Record<string, string>[], statusCol: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const s = (row[statusCol] || '').toLowerCase().trim();
      if (!s) continue;
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }

  // Field picker with two-stage matching: exact candidates first, then
  // heuristic substring match. `heuristics` are lowercased substrings;
  // if any appears in a key (also lowercased), that key is used.
  function pickFieldWithHeuristics(
    row: Record<string, string>,
    exactCandidates: string[],
    heuristics: string[] = []
  ): string {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
    const normalizedRow: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      normalizedRow[normalize(key)] = row[key];
    }
    // Exact match first
    for (const candidate of exactCandidates) {
      const v = normalizedRow[normalize(candidate)];
      if (v && v.trim()) return v.trim();
    }
    // Heuristic fallback — find first key whose lowercase form
    // contains any of the heuristic substrings
    if (heuristics.length > 0) {
      for (const key of Object.keys(row)) {
        const keyLower = key.toLowerCase();
        for (const hint of heuristics) {
          if (keyLower.includes(hint)) {
            const v = row[key];
            if (v && v.trim()) return v.trim();
          }
        }
      }
    }
    return '';
  }

  // Build attendee textarea text from parsed rows. Respects status
  // filter when statusCol is non-null. Used both on initial upload
  // and on filter toggle.
  function buildAttendeeTextFromRows(
    rows: Record<string, string>[],
    statusCol: string | null,
    selected: Set<string>
  ): string {
    return rows
      .filter(row => {
        if (!statusCol) return true;
        const s = (row[statusCol] || '').toLowerCase().trim();
        return selected.has(s);
      })
      .map(row => {
        const name = pickFieldWithHeuristics(row, ['Name', 'Full Name', 'First Name']);
        const company = pickFieldWithHeuristics(
          row,
          ['Company', 'Company Name', 'Organization', 'Org', 'Firm'],
          COMPANY_HEURISTIC_SUBSTRINGS
        );
        const title = pickFieldWithHeuristics(
          row,
          ['Title', 'Job Title', 'Position', 'Role'],
          TITLE_HEURISTIC_SUBSTRINGS
        );
        const email = pickFieldWithHeuristics(row, ['Email', 'Email Address', 'E-mail']);
        if (!name) return null;
        return [name, company, title, email].filter(Boolean).join(',');
      })
      .filter(Boolean)
      .join('\n');
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      // Skip Luma-style title rows: if the first line has very few
      // non-empty cells but the second line has many, the first line
      // is a title (e.g., the event name) and the real headers are
      // on line 2.
      beforeFirstChunk: (chunk: string) => {
        const lines = chunk.split(/\r?\n/);
        if (lines.length < 2) return chunk;
        const countNonEmpty = (line: string) =>
          line.split(',').filter(c => c.trim().length > 0).length;
        const firstCount = countNonEmpty(lines[0]);
        const secondCount = countNonEmpty(lines[1]);
        if (firstCount <= 2 && secondCount >= 5) {
          // Drop the title row
          return lines.slice(1).join('\n');
        }
        return chunk;
      },
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const statusCol = detectStatusColumn(rows);

        if (!statusCol) {
          // No status column — behave as before, append to textarea.
          const mappedText = buildAttendeeTextFromRows(rows, null, new Set());
          setAttendeeText(prev => prev ? `${prev}\n${mappedText}` : mappedText);
          setUploadedCsvRows(null);
          setStatusColumn(null);
          setStatusCounts({});
          setSelectedStatuses(new Set());
          return;
        }

        // Status column present — apply default filter.
        const counts = countStatuses(rows, statusCol);
        const defaultSelected = new Set(
          Object.keys(counts).filter(s => APPROVED_STATUSES.has(s))
        );
        // If no statuses match the "approved" set, fall back to all
        // (avoids silently showing zero attendees on unusual CSVs).
        if (defaultSelected.size === 0) {
          for (const k of Object.keys(counts)) defaultSelected.add(k);
        }

        setUploadedCsvRows(rows);
        setStatusColumn(statusCol);
        setStatusCounts(counts);
        setSelectedStatuses(defaultSelected);

        const filteredText = buildAttendeeTextFromRows(rows, statusCol, defaultSelected);
        // Replace attendeeText entirely when filter is applied so the
        // textarea reflects exactly what the filter produced.
        setAttendeeText(filteredText);
      },
    });
  };

  const toggleStatus = (status: string) => {
    if (!uploadedCsvRows || !statusColumn) return;
    const next = new Set(selectedStatuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setSelectedStatuses(next);
    const filteredText = buildAttendeeTextFromRows(uploadedCsvRows, statusColumn, next);
    setAttendeeText(filteredText);
  };

  // ─── Organizer Outreach ───────────────────────────────────────────
  const openOrganizerDraft = () => {
    const name = user?.displayName || user?.email?.split('@')[0] || 'A Daymaker Connect user';
    const nameForEvent = eventName?.trim() || 'your event';
    let dateLabel = 'an upcoming date';
    if (eventDate) {
      try {
        const d = new Date(eventDate);
        if (!Number.isNaN(d.getTime())) {
          dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        }
      } catch { /* keep default */ }
    }
    setOrganizerSubject(`Attendee list request for ${nameForEvent}`);
    setOrganizerBody(
      `Hi,\n\n` +
      `I'm attending ${nameForEvent} on ${dateLabel} and I use a networking tool called Daymaker Connect that helps me prepare for events by identifying relevant connections among attendees.\n\n` +
      `Would you be open to sharing the attendee list (or a portion of it) so I can make the most of the event? The list would only be used to match against my own LinkedIn network — no data is stored or shared publicly.\n\n` +
      `Thank you,\n${name}`
    );
    setOrganizerCopied(false);
    setShowOrganizerModal(true);
  };

  const copyOrganizerDraft = async () => {
    const text = `Subject: ${organizerSubject}\n\n${organizerBody}`;
    try {
      await navigator.clipboard.writeText(text);
      setOrganizerCopied(true);
      setTimeout(() => setOrganizerCopied(false), 2500);
    } catch { /* clipboard API may be unavailable */ }
  };

  const openOrganizerInMail = () => {
    const mailto = `mailto:?subject=${encodeURIComponent(organizerSubject)}&body=${encodeURIComponent(organizerBody)}`;
    window.location.href = mailto;
  };

  // ─── Submit ───────────────────────────────────────────────────────
  // Parses attendee text that may come from CSV pastes, Luma exports, or freeform lists.
  // Supports "Name, Company, Title" rows, bare-name rows, and messy rows with URLs/IDs/prices mixed in.
  const parseAttendeeText = (text: string) => {
    const URL_RE = /(https?:\/\/|www\.)/i;
    // UUID-ish, long hex, or long pure-digit strings → treat as IDs, not names
    const ID_RE = /^(?:[0-9a-f]{8,}(?:-[0-9a-f]{4,})*|\d{5,})$/i;
    const PRICE_RE = /^[\$€£¥]\s*\d|\b\d+(?:\.\d+)?\s*(?:usd|eur|gbp|jpy|cad|aud|dollars?|euros?|pounds?|yen)\b/i;
    // Run of 2–4 capitalized word tokens, allowing hyphens, apostrophes, accented letters
    const NAME_RE = /(?:[A-ZÀ-Ý][\p{L}'’\-]+\s+){1,3}[A-ZÀ-Ý][\p{L}'’\-]+/u;
    const SINGLE_CAP_RE = /^[A-ZÀ-Ý][\p{L}'’\-]{1,}$/u;

    const isJunk = (s: string) => {
      const t = s.trim();
      if (!t) return true;
      if (URL_RE.test(t)) return true;
      if (ID_RE.test(t)) return true;
      if (PRICE_RE.test(t)) return true;
      return false;
    };

    const cleanField = (s: string | undefined) => {
      if (!s) return '';
      const t = s.trim();
      return isJunk(t) ? '' : t;
    };

    const results: { name: string; company: string; title: string }[] = [];
    const seen = new Set<string>();

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      // Drop rows that are nothing but a URL or a price
      if (URL_RE.test(line) && !line.includes(',')) continue;
      if (PRICE_RE.test(line) && !line.includes(',')) continue;

      let name = '';
      let company = '';
      let title = '';

      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim());
        name = cleanField(parts[0]);
        company = cleanField(parts[1]);
        title = cleanField(parts[2]);

        // If the first column is junk, try to recover a name from later columns
        if (!name) {
          for (let i = 1; i < parts.length; i++) {
            const m = parts[i].match(NAME_RE);
            if (m) { name = m[0]; break; }
          }
        }
      } else {
        const m = line.match(NAME_RE);
        if (m) {
          name = m[0].trim();
        } else if (!isJunk(line) && SINGLE_CAP_RE.test(line)) {
          // Single capitalized token — accept as a mononym/first name only
          name = line;
        }
      }

      if (!name || isJunk(name)) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ name, company, title });
    }

    return results;
  };

  const handleCreateEvent = async (e: FormEvent) => {
    e.preventDefault();
    setGenerateError('');
    setLimitReached(null);
    setIsGenerating(true);
    const attendees = parseAttendeeText(attendeeText);
    if (!attendees.length) { setGenerateError('Please provide at least one attendee.'); setIsGenerating(false); return; }
    try {
      const token = await getIdToken();
      const hasUrls = Boolean(detectedUrls.luma || detectedUrls.eventbrite);
      const res = await fetch('/api/events/prebrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          eventName,
          eventDate,
          eventLocation,
          eventDescription: eventDescription?.trim() ? eventDescription.trim() : undefined,
          detectedUrls: hasUrls ? detectedUrls : undefined,
          attendees,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'limit_reached') {
          setLimitReached({
            message: data.message || 'Event Briefings require a Pro subscription. Upgrade to unlock.',
            upgradeUrl: data.upgradeUrl || '/settings',
          });
          setIsGenerating(false);
          return;
        }
        throw new Error(data.error || 'Failed to generate briefing.');
      }
      if (data.partial) {
        console.warn(
          `Pre-brief partial: ${data.generatedCount}/${data.requestedCount} attendees generated. Failed batches:`,
          data.failedBatches,
        );
      }
      setShowModal(false);
      router.push(`/events/${data.eventId}`);
    } catch (err: any) { console.error(err); setGenerateError(err.message); }
    finally { setIsGenerating(false); }
  };

  const formatEventDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  // Connection label
  const connectedCount = (googleConnected ? 1 : 0) + (microsoftConnected ? 1 : 0);
  const connectionLabel = connectedCount === 0 ? 'Connect Calendar'
    : connectedCount === 1 ? (googleConnected ? 'Google Connected' : 'Outlook Connected')
      : '2 Calendars Connected';

  // Render helper for a single briefing card. Used for both upcoming
  // and past sections so layout stays identical. The outer div is NOT
  // the click target — sub-regions (content + "View Briefing" link)
  // handle their own navigation and the X button does stopPropagation
  // so deleting doesn't accidentally navigate away.
  const renderBriefingCard = (ev: EventBriefing) => {
    const dateStr = ev.eventDate
      ? new Date((ev.eventDate as any).seconds * 1000).toLocaleDateString()
      : 'No date';
    return (
      <div key={ev.eventId} className="card"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px' }}>
        <div
          onClick={() => router.push(`/events/${ev.eventId}`)}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
        >
          <h3 style={{ fontSize: '16px', color: 'var(--text)', margin: '0 0 8px 0', fontFamily: "'Inter', sans-serif" }}>{ev.eventName}</h3>
          <div style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span>📍 {ev.eventLocation || 'Unknown'}</span>
            <span>📅 {dateStr}</span>
            <span>👥 {ev.attendees?.length || 0} Attendees</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
          <div
            onClick={() => router.push(`/events/${ev.eventId}`)}
            style={{ color: 'var(--orange)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            View Briefing →
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setBriefingToDelete(ev); }}
            title="Delete this briefing"
            aria-label="Delete briefing"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text2)', borderRadius: '6px',
              width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <main style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '32px', margin: '0 0 8px 0', color: 'var(--text)' }}>
            Event Briefings
          </h1>
          <div style={{ color: 'var(--text2)', fontSize: '15px' }}>
            Generate AI intelligence briefs for your upcoming meetings and conferences.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn" onClick={() => setShowCalendarModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {anyCalendarConnected ? (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            )}
            {connectionLabel}
          </button>
          <button className="btn primary" onClick={handleManualCreate}>+ New Event Briefing</button>
        </div>
      </div>

      {/* Error banner */}
      {calendarError && (
        <div style={{
          padding: '12px 16px', background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '8px', color: 'var(--red)', fontSize: '13px', marginBottom: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>{calendarError}</span>
          <button onClick={() => setCalendarError('')} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
      )}

      {/* ─── Upcoming Calendar Events ────────────────────────────────── */}
      {anyCalendarConnected && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div className="section-label">FROM YOUR CALENDARS</div>
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '22px', margin: 0, color: 'var(--text)' }}>Upcoming Events</h2>
            </div>
            <button className="btn" onClick={fetchCalendarEvents} disabled={calendarLoading} style={{ fontSize: '12px' }}>
              {calendarLoading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>

          {calendarLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '24px', color: 'var(--text2)' }}>
              <div className="loading-spinner" style={{ width: '20px', height: '20px' }} />Loading calendar events...
            </div>
          ) : visibleEvents.length === 0 ? (
            <div style={{ padding: '24px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '14px', textAlign: 'center' }}>
              {calendarEvents.length === 0
                ? 'No upcoming events in the next 30 days.'
                : `All ${calendarEvents.length} upcoming event${calendarEvents.length === 1 ? '' : 's'} hidden. Manage hidden events below.`}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {visibleEvents.map((calEvent) => {
                const urls = detectEventUrls(calEvent.description);
                const occurrenceCount = calEvent.occurrences.length;
                return (
                  <div key={`${calEvent.source}-${calEvent.id}`} className="card"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'default' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '15px', color: 'var(--text)', margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {calEvent.title}
                        </h3>
                        <SourceBadge source={calEvent.source} />
                        {calEvent.isRecurring && (
                          <span
                            title={`Recurring event — ${occurrenceCount} upcoming in the next 30 days`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
                              borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                              background: 'rgba(249, 148, 30, 0.12)', color: '#F9941E',
                            }}
                          >
                            🔁 {occurrenceCount > 1 ? `${occurrenceCount} upcoming` : 'Recurring'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span>🗓 {calEvent.isRecurring && occurrenceCount > 1 ? 'Next: ' : ''}{formatEventDate(calEvent.startTime)}</span>
                        {calEvent.location && <span>📍 {calEvent.location}</span>}
                        <span>👥 {calEvent.attendees.length} attendee{calEvent.attendees.length !== 1 ? 's' : ''}</span>
                      </div>
                      <EventUrlBadges urls={urls} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
                      <button
                        className="btn primary"
                        onClick={() => handleCalendarEventPreBrief(calEvent)}
                        style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                      >
                        Generate Pre-Brief
                      </button>
                      <button
                        onClick={() => handleHideClick(calEvent)}
                        title={calEvent.isRecurring ? 'Hide this occurrence or the whole series' : 'Hide this event'}
                        aria-label="Hide event"
                        style={{
                          background: 'transparent', border: '1px solid var(--border)',
                          color: 'var(--text2)', borderRadius: '6px',
                          width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Hidden events management */}
          {hiddenEventsDisplay.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => setShowHiddenPanel((v) => !v)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text2)',
                  fontSize: '12px', cursor: 'pointer', padding: '4px 0',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
              >
                {showHiddenPanel ? '▾' : '▸'} Hidden events ({hiddenEventsDisplay.length})
              </button>
              {showHiddenPanel && (
                <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                  {hiddenEventsDisplay.map(({ event, hideType, hideIdKey }) => (
                    <div
                      key={hideIdKey}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{event.title}</span>
                        <span style={{ marginLeft: '8px', fontSize: '11px' }}>
                          {hideType === 'series' ? 'entire series hidden' : 'single occurrence hidden'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnhide(hideType, hideIdKey)}
                        className="btn"
                        style={{ fontSize: '11px', padding: '4px 10px' }}
                      >
                        Unhide
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      {anyCalendarConnected && events.length > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '32px 0' }} />}

      {/* ─── Saved Briefings ─────────────────────────────────────────── */}
      <div>
        {events.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div className="section-label">SAVED BRIEFINGS</div>
            <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '22px', margin: 0, color: 'var(--text)' }}>Your Event Briefings</h2>
          </div>
        )}
        {isLoading ? (
          <div style={{ color: 'var(--text2)' }}>Loading events...</div>
        ) : events.length === 0 && !anyCalendarConnected ? (
          <div style={{ background: 'var(--surface)', padding: '48px', borderRadius: '8px', border: '1px dashed var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
            <h3 style={{ color: 'var(--text)', marginBottom: '8px', fontSize: '18px', fontFamily: "'Instrument Serif', Georgia, serif" }}>Create your first event briefing</h3>
            <p style={{ color: 'var(--text2)', fontSize: '14px', maxWidth: '420px', margin: '0 auto 24px', lineHeight: 1.6 }}>Connect your calendar to auto-import upcoming events, or create a briefing manually from a pasted attendee list.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setShowCalendarModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Connect Calendar
              </button>
              <button className="btn primary" onClick={handleManualCreate}>Create Manually</button>
            </div>
          </div>
        ) : events.length === 0 && anyCalendarConnected ? (
          <div style={{ background: 'var(--surface)', padding: '32px', borderRadius: '8px', border: '1px dashed var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
            <h3 style={{ color: 'var(--text)', marginBottom: '8px', fontSize: '18px', fontFamily: "'Instrument Serif', Georgia, serif" }}>Create your first event briefing</h3>
            <p style={{ color: 'var(--text2)', fontSize: '13px', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.6 }}>Generate a pre-brief from any calendar event above, or create one manually.</p>
            <button className="btn primary" onClick={handleManualCreate}>+ New Event Briefing</button>
          </div>
        ) : (
          <>
            {/* Upcoming briefings */}
            {upcomingBriefings.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' }}>
                {upcomingBriefings.map(ev => renderBriefingCard(ev))}
              </div>
            )}

            {/* Past briefings toggle + collapsed panel */}
            {pastBriefings.length > 0 && (
              <div style={{ marginTop: upcomingBriefings.length > 0 ? '16px' : 0 }}>
                <button
                  onClick={() => setShowPastBriefings(v => !v)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text2)',
                    fontSize: '12px', cursor: 'pointer', padding: '4px 0',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {showPastBriefings ? '▾' : '▸'} Past Briefings ({pastBriefings.length})
                </button>
                {showPastBriefings && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', marginTop: '8px' }}>
                    {pastBriefings.map(ev => renderBriefingCard(ev))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ Calendar Connect Modal ═══════════════════════════════════ */}
      {showCalendarModal && (
        <Modal isOpen={showCalendarModal} onClose={() => setShowCalendarModal(false)} title="Connect Your Calendar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--text2)', fontSize: '14px', margin: '0 0 8px 0', lineHeight: 1.6 }}>
              Connect a calendar to automatically import upcoming events with attendee lists.
              We only <strong style={{ color: 'var(--text)' }}>read</strong> your calendar — we never create, edit, or delete events.
            </p>

            {/* Google */}
            {googleConnected ? (
              <div style={{ padding: '16px', background: 'var(--green-dim)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <GoogleIcon size={24} />
                  <div><div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Google Calendar</div><div style={{ fontSize: '12px', color: 'var(--green)' }}>Connected</div></div>
                </div>
                <button onClick={handleDisconnectGoogle} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Disconnect</button>
              </div>
            ) : (
              <button onClick={handleConnectGoogle} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left', fontFamily: 'inherit', color: 'var(--text)' }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#4285F4'} onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <GoogleIcon size={24} />
                <div style={{ flex: 1 }}><div style={{ fontSize: '14px', fontWeight: 600 }}>Google Calendar</div><div style={{ fontSize: '12px', color: 'var(--text2)' }}>Import events and attendee lists</div></div>
                <span style={{ color: 'var(--orange)', fontSize: '13px', fontWeight: 600 }}>Connect →</span>
              </button>
            )}

            {/* Microsoft */}
            {microsoftConnected ? (
              <div style={{ padding: '16px', background: 'var(--green-dim)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <MicrosoftIcon size={24} />
                  <div><div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Outlook Calendar</div><div style={{ fontSize: '12px', color: 'var(--green)' }}>Connected</div></div>
                </div>
                <button onClick={handleDisconnectMicrosoft} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Disconnect</button>
              </div>
            ) : (
              <button onClick={handleConnectMicrosoft} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left', fontFamily: 'inherit', color: 'var(--text)' }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#0078D4'} onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <MicrosoftIcon size={24} />
                <div style={{ flex: 1 }}><div style={{ fontSize: '14px', fontWeight: 600 }}>Outlook Calendar</div><div style={{ fontSize: '12px', color: 'var(--text2)' }}>Microsoft 365 integration</div></div>
                <span style={{ color: 'var(--orange)', fontSize: '13px', fontWeight: 600 }}>Connect →</span>
              </button>
            )}

            {/* Apple — Coming Soon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', opacity: 0.5, cursor: 'not-allowed' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#333" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold"></text></svg>
              <div style={{ flex: 1 }}><div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Apple Calendar</div><div style={{ fontSize: '12px', color: 'var(--text2)' }}>iCloud calendar sync</div></div>
              <span style={{ padding: '4px 10px', background: 'var(--orange-dim)', color: 'var(--orange)', borderRadius: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px' }}>COMING SOON</span>
            </div>

            <div style={{ marginTop: '8px', padding: '12px', background: 'var(--blue-dim)', borderRadius: '6px', fontSize: '12px', color: 'var(--blue)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>🔒</span>
              <span>Read-only access. We only read event titles, dates, locations, and attendee lists. We never create, modify, or delete calendar events.</span>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══ Create / Pre-Brief Event Briefing Modal ═════════════════ */}
      {showModal && (
        <Modal isOpen={showModal} onClose={() => { setShowModal(false); setSourceCalendarEvent(null); }}
          title={sourceCalendarEvent ? 'Generate Event Briefing' : 'Create Event Briefing'}>
          <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Source indicator — shows when pre-populated from calendar */}
            {sourceCalendarEvent && (
              <div style={{
                padding: '10px 14px', background: 'var(--surface2)', borderRadius: '6px',
                fontSize: '12px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '8px',
                border: '1px solid var(--border)',
              }}>
                <SourceBadge source={sourceCalendarEvent.source} />
                <span>Pre-populated from your calendar event</span>
              </div>
            )}

            {/* Luma Detection Badge + Import Button */}
            {detectedUrls.luma && !showLumaPreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
                  background: 'rgba(255,107,107,0.12)', color: '#FF6B6B',
                }}>
                  🎪 LUMA EVENT DETECTED
                </span>
                <button type="button" onClick={handleImportFromLuma} disabled={lumaLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                    background: 'linear-gradient(135deg, rgba(255,107,107,0.08) 0%, rgba(255,154,68,0.08) 100%)',
                    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px',
                    cursor: lumaLoading ? 'wait' : 'pointer', width: '100%', textAlign: 'left',
                    fontFamily: 'inherit', color: 'var(--text)', transition: 'all 0.2s',
                  }}>
                  <span style={{ fontSize: '24px' }}>🎪</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#FF6B6B' }}>
                      {lumaLoading ? 'Importing from Luma...' : 'Import from Luma'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {detectedUrls.luma}
                    </div>
                  </div>
                  {lumaLoading ? (
                    <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
                  ) : (
                    <span style={{ color: '#FF6B6B', fontWeight: 600, fontSize: '13px' }}>Import →</span>
                  )}
                </button>
              </div>
            )}

            {/* Luma Error */}
            {lumaError && (
              <div style={{ padding: '10px 14px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '12px' }}>
                ⚠ {lumaError}
              </div>
            )}

            {/* Luma Preview — shown after successful import */}
            {showLumaPreview && lumaData && (
              <div style={{
                padding: '14px', background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)',
                borderRadius: '8px', fontSize: '13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, color: '#FF6B6B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🎪 Imported from Luma
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
                    {lumaData.hosts.length} host{lumaData.hosts.length !== 1 ? 's' : ''} · {lumaData.attendees.length} attendee{lumaData.attendees.length !== 1 ? 's' : ''}
                    {lumaData.attendeeCount && ` · ${lumaData.attendeeCount} registered`}
                  </span>
                </div>
                {lumaData.hosts.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text)' }}>Hosts:</strong> {lumaData.hosts.join(', ')}
                  </div>
                )}
                {lumaData.attendees.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                    <strong style={{ color: 'var(--text)' }}>Attendees/Speakers:</strong>{' '}
                    {lumaData.attendees.slice(0, 10).map(a => a.name).join(', ')}
                    {lumaData.attendees.length > 10 && ` (+${lumaData.attendees.length - 10} more)`}
                  </div>
                )}
              </div>
            )}

            {/* Eventbrite Detection Badge + Import Button */}
            {detectedUrls.eventbrite && !showEventbritePreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
                  background: 'rgba(244,141,54,0.12)', color: '#F48D36',
                }}>
                  🎟 EVENTBRITE EVENT DETECTED
                </span>
                <button type="button" onClick={handleImportFromEventbrite} disabled={eventbriteLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                    background: 'linear-gradient(135deg, rgba(244,141,54,0.08) 0%, rgba(255,183,77,0.08) 100%)',
                    border: '1px solid rgba(244,141,54,0.3)', borderRadius: '8px',
                    cursor: eventbriteLoading ? 'wait' : 'pointer', width: '100%', textAlign: 'left',
                    fontFamily: 'inherit', color: 'var(--text)', transition: 'all 0.2s',
                  }}>
                  <span style={{ fontSize: '24px' }}>🎟</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#F48D36' }}>
                      {eventbriteLoading ? 'Importing from Eventbrite...' : 'Import from Eventbrite'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {detectedUrls.eventbrite}
                    </div>
                  </div>
                  {eventbriteLoading ? (
                    <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
                  ) : (
                    <span style={{ color: '#F48D36', fontWeight: 600, fontSize: '13px' }}>Import →</span>
                  )}
                </button>
              </div>
            )}

            {eventbriteError && (
              <div style={{ padding: '10px 14px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '12px' }}>
                ⚠ {eventbriteError}
              </div>
            )}

            {showEventbritePreview && eventbriteData && (
              <div style={{
                padding: '14px', background: 'rgba(244,141,54,0.06)', border: '1px solid rgba(244,141,54,0.2)',
                borderRadius: '8px', fontSize: '13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, color: '#F48D36', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🎟 Imported from Eventbrite
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
                    {eventbriteData.hosts.length} host{eventbriteData.hosts.length !== 1 ? 's' : ''} · {eventbriteData.attendees.length} speaker{eventbriteData.attendees.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {eventbriteData.hosts.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text)' }}>Organizers:</strong> {eventbriteData.hosts.join(', ')}
                  </div>
                )}
                {eventbriteData.attendees.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                    <strong style={{ color: 'var(--text)' }}>Speakers:</strong>{' '}
                    {eventbriteData.attendees.slice(0, 10).map(a => a.name).join(', ')}
                    {eventbriteData.attendees.length > 10 && ` (+${eventbriteData.attendees.length - 10} more)`}
                  </div>
                )}
              </div>
            )}

            {limitReached && (
              <UpgradeCard
                message={limitReached.message}
                upgradeUrl={limitReached.upgradeUrl}
                onDismiss={() => setLimitReached(null)}
              />
            )}

            {generateError && (
              <div style={{ padding: '12px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '13px' }}>{generateError}</div>
            )}

            {/* Event details form */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Event Name</label>
                <input required type="text" className="auth-input" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. SaaStr Annual 2026" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Date</label>
                <input type="date" className="auth-input" value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Location</label>
              <input type="text" className="auth-input" value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="e.g. San Francisco, CA" />
            </div>

            {/* Event description (pre-filled from calendar) */}
            {eventDescription && (() => {
              const lineCount = eventDescription.split('\n').length;
              const isLong = eventDescription.length > 220 || lineCount > 3;
              return (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Event Description</label>
                  {isLong && !descExpanded ? (
                    <>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text2)',
                          lineHeight: 1.6,
                          background: 'var(--darker)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '12px',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {eventDescription}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDescExpanded(true)}
                        style={{ marginTop: '6px', background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600 }}
                      >
                        Read more
                      </button>
                    </>
                  ) : (
                    <>
                      <textarea
                        className="auth-input"
                        style={{ height: isLong ? '200px' : '80px', resize: 'vertical', fontSize: '12px' }}
                        value={eventDescription}
                        onChange={e => setEventDescription(e.target.value)}
                      />
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setDescExpanded(false)}
                          style={{ marginTop: '6px', background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600 }}
                        >
                          Read less
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Attendees */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)' }}>
                  Attendees
                  {attendeeText && (
                    <span style={{ marginLeft: '8px', color: 'var(--orange)', fontWeight: 600 }}>
                      ({attendeeText.split('\n').filter(l => l.trim()).length})
                    </span>
                  )}
                </label>
                <div onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: '12px', color: 'var(--orange)', cursor: 'pointer', fontWeight: 600 }}>Upload CSV</div>
                <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
              <textarea required className="auth-input"
                style={{ height: '160px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                value={attendeeText} onChange={e => setAttendeeText(e.target.value)}
                placeholder={"Paste attendee list (one per line)\nFormat: Name, Company, Title"} />
              {(() => {
                const hasAttendees = attendeeText.split('\n').some(l => l.trim().length > 0);
                return hasAttendees ? (
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
                    For best results, separate columns with commas. Missing columns are OK.
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--orange)', marginTop: '6px', fontWeight: 500 }}>
                    Add at least one attendee to generate a briefing.
                  </div>
                );
              })()}

              {statusColumn && Object.keys(statusCounts).length > 0 && (() => {
                const selectedCount = Array.from(selectedStatuses)
                  .reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
                const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
                return (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowFilterExpanded(v => !v)}
                    >
                      <div style={{ color: 'var(--text2)' }}>
                        Filter: analyzing{' '}
                        <span style={{ color: 'var(--orange)', fontWeight: 600 }}>
                          {selectedCount}
                        </span>
                        {' '}of {totalCount} attendees
                        <span style={{ marginLeft: '8px', color: 'var(--text2)', fontSize: '11px', opacity: 0.7 }}>
                          (by {statusColumn})
                        </span>
                      </div>
                      <span style={{ color: 'var(--text2)' }}>
                        {showFilterExpanded ? '▾' : '▸'}
                      </span>
                    </div>

                    {showFilterExpanded && (
                      <div style={{
                        marginTop: '10px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}>
                        {Object.entries(statusCounts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([status, count]) => {
                            const active = selectedStatuses.has(status);
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => toggleStatus(status)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '20px',
                                  border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                                  background: active ? 'rgba(249, 148, 30, 0.15)' : 'transparent',
                                  color: active ? 'var(--orange)' : 'var(--text2)',
                                  fontSize: '11px',
                                  fontFamily: 'inherit',
                                  cursor: 'pointer',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {status} ({count})
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Organizer outreach — shown when the user has no attendee list yet */}
            {(() => {
              const hasAttendees = attendeeText.split('\n').some(l => l.trim().length > 0);
              if (hasAttendees) return null;
              return (
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--surface2)',
                  border: '1px dashed var(--border)',
                  borderRadius: '8px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      Don&apos;t have the attendee list?
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px', lineHeight: 1.5 }}>
                      Ask the event organizer directly — we&apos;ll draft a friendly email you can paste into your mail client.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openOrganizerDraft}
                    className="btn"
                    style={{ alignSelf: 'flex-start', padding: '8px 14px', fontSize: '13px' }}
                  >
                    ✉ Request List from Organizer
                  </button>
                </div>
              );
            })()}

            {(() => {
              const hasAttendees = attendeeText.split('\n').some(l => l.trim().length > 0);
              const disabled = isGenerating || !hasAttendees;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={disabled}
                    style={{
                      padding: '12px 24px',
                      opacity: disabled ? 0.5 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    }}
                  >
                    {isGenerating ? (
                      <>
                        <div className="loading-spinner" style={{ width: '16px', height: '16px' }} />
                        <span>{BRIEFING_PHASE_LABELS[phaseIndex]}</span>
                      </>
                    ) : 'Generate Briefing'}
                  </button>
                  {isGenerating && (
                    <div style={{ fontSize: '11px', color: 'var(--text2)', textAlign: 'center', fontStyle: 'italic' }}>
                      This typically takes 15–30 seconds depending on the number of attendees
                    </div>
                  )}
                </div>
              );
            })()}
          </form>
        </Modal>
      )}

      {/* ═══ Organizer Outreach Draft Modal ══════════════════════════ */}
      {showOrganizerModal && (
        <Modal
          isOpen={showOrganizerModal}
          onClose={() => setShowOrganizerModal(false)}
          title="Request Attendee List from Organizer"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              We&apos;ve drafted a friendly note you can send to the event organizer. Edit anything you like,
              then copy it or open it directly in your mail client.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>Subject</label>
              <input
                type="text"
                value={organizerSubject}
                onChange={(e) => setOrganizerSubject(e.target.value)}
                className="auth-input"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>Message</label>
              <textarea
                value={organizerBody}
                onChange={(e) => setOrganizerBody(e.target.value)}
                className="auth-input"
                style={{ height: '240px', resize: 'vertical', fontSize: '13px', lineHeight: 1.55 }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={copyOrganizerDraft}
                className="btn"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {organizerCopied ? 'Copied ✓' : 'Copy to Clipboard 📋'}
              </button>
              <button
                type="button"
                onClick={openOrganizerInMail}
                className="btn primary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Open in Mail ✉
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* ═══ Hide Event Chooser Modal ═══════════════════════════════ */}
      {hideTarget && (
        <Modal
          isOpen={!!hideTarget}
          onClose={() => { if (!hiding) setHideTarget(null); }}
          title="Hide this event?"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>
                {hideTarget.title}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                Recurring event · {hideTarget.occurrences.length} upcoming in the next 30 days
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              This is a repeating meeting. You can hide just this one occurrence,
              or hide every occurrence of the series. You can unhide from the
              &ldquo;Hidden events&rdquo; panel at any time.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={confirmHideSeries}
                disabled={hiding}
                className="btn primary"
                style={{ padding: '10px 16px', fontSize: '13px', justifyContent: 'flex-start' }}
              >
                Hide the whole series
                <span style={{ display: 'block', fontSize: '11px', fontWeight: 400, opacity: 0.85, marginTop: '2px' }}>
                  All {hideTarget.occurrences.length} upcoming occurrences removed from this list
                </span>
              </button>

              <button
                type="button"
                onClick={confirmHideInstance}
                disabled={hiding}
                className="btn"
                style={{ padding: '10px 16px', fontSize: '13px', justifyContent: 'flex-start' }}
              >
                Hide just this occurrence
                <span style={{ display: 'block', fontSize: '11px', fontWeight: 400, opacity: 0.85, marginTop: '2px' }}>
                  {formatEventDate(hideTarget.startTime)} only
                </span>
              </button>

              <button
                type="button"
                onClick={() => setHideTarget(null)}
                disabled={hiding}
                className="btn"
                style={{ padding: '8px 16px', fontSize: '12px', background: 'transparent' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══ Delete Briefing Confirmation Modal ═══════════════════════ */}
      {briefingToDelete && (
        <Modal
          isOpen={!!briefingToDelete}
          onClose={() => { if (!deletingBriefing) setBriefingToDelete(null); }}
          title="Delete this briefing?"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>
                {briefingToDelete.eventName}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                {briefingToDelete.attendees?.length || 0} attendee briefing
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              This will permanently delete the briefing and all its generated
              attendee analysis. This cannot be undone.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={confirmDeleteBriefing}
                disabled={deletingBriefing}
                className="btn primary"
                style={{ padding: '10px 16px', fontSize: '13px' }}
              >
                {deletingBriefing ? 'Deleting...' : 'Yes, delete this briefing'}
              </button>
              <button
                type="button"
                onClick={() => setBriefingToDelete(null)}
                disabled={deletingBriefing}
                className="btn"
                style={{ padding: '8px 16px', fontSize: '12px', background: 'transparent' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

    </main>
  );
}
