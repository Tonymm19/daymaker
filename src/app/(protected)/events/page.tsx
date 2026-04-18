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

import { useState, useRef, FormEvent, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getDb } from '@/lib/firebase/config';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAuth } from '@/lib/firebase/config';
import Modal from '@/components/ui/Modal';
import Papa from 'papaparse';
import type { EventBriefing } from '@/lib/types';

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
  const [events, setEvents] = useState<EventBriefing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  const [attendeeText, setAttendeeText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Smart URL detection state
  const [detectedUrls, setDetectedUrls] = useState<DetectedUrls>({ luma: null, eventbrite: null });
  const [lumaLoading, setLumaLoading] = useState(false);
  const [lumaData, setLumaData] = useState<LumaScrapedData | null>(null);
  const [lumaError, setLumaError] = useState('');
  const [showLumaPreview, setShowLumaPreview] = useState(false);

  // Source calendar event for the modal (null = manual creation)
  const [sourceCalendarEvent, setSourceCalendarEvent] = useState<CalendarEvent | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const anyCalendarConnected = googleConnected || microsoftConnected;

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

  // ─── File upload ──────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const mappedText = rows.map(row => {
          const name = row['Name'] || row['First Name'] || row['Full Name'];
          const company = row['Company'] || row['Organization'];
          const title = row['Title'] || row['Position'];
          if (!name) return null;
          return [name, company, title].filter(Boolean).join(',');
        }).filter(Boolean).join('\n');
        setAttendeeText(prev => prev ? `${prev}\n${mappedText}` : mappedText);
      }
    });
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate briefing.');
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
          ) : calendarEvents.length === 0 ? (
            <div style={{ padding: '24px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '14px', textAlign: 'center' }}>
              No upcoming events in the next 30 days.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {calendarEvents.map((calEvent) => {
                const urls = detectEventUrls(calEvent.description);
                return (
                  <div key={`${calEvent.source}-${calEvent.id}`} className="card"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'default' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h3 style={{ fontSize: '15px', color: 'var(--text)', margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {calEvent.title}
                        </h3>
                        <SourceBadge source={calEvent.source} />
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span>🗓 {formatEventDate(calEvent.startTime)}</span>
                        {calEvent.location && <span>📍 {calEvent.location}</span>}
                        <span>👥 {calEvent.attendees.length} attendee{calEvent.attendees.length !== 1 ? 's' : ''}</span>
                      </div>
                      <EventUrlBadges urls={urls} />
                    </div>
                    <button className="btn primary" onClick={() => handleCalendarEventPreBrief(calEvent)}
                      style={{ marginLeft: '16px', whiteSpace: 'nowrap', fontSize: '12px' }}>
                      Generate Pre-Brief
                    </button>
                  </div>
                );
              })}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' }}>
            {events.map(ev => {
              const dateStr = ev.eventDate ? new Date((ev.eventDate as any).seconds * 1000).toLocaleDateString() : 'No date';
              return (
                <div key={ev.eventId} onClick={() => router.push(`/events/${ev.eventId}`)} className="card"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', cursor: 'pointer' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', color: 'var(--text)', margin: '0 0 8px 0', fontFamily: "'Inter', sans-serif" }}>{ev.eventName}</h3>
                    <div style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', gap: '16px' }}>
                      <span>📍 {ev.eventLocation || 'Unknown'}</span><span>📅 {dateStr}</span><span>👥 {ev.attendees?.length || 0} Attendees</span>
                    </div>
                  </div>
                  <div style={{ color: 'var(--orange)', fontWeight: 600, fontSize: '13px' }}>View Briefing →</div>
                </div>
              );
            })}
          </div>
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

            {/* Luma Import Button — shown when Luma URL detected */}
            {detectedUrls.luma && !showLumaPreview && (
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
                    {lumaLoading ? 'Importing from Luma...' : 'Import Attendees from Luma'}
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

            {/* Eventbrite detection notice */}
            {detectedUrls.eventbrite && (
              <div style={{
                padding: '10px 14px', background: 'rgba(244,141,54,0.06)', border: '1px solid rgba(244,141,54,0.2)',
                borderRadius: '6px', fontSize: '12px', color: '#F48D36',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span>🎟</span>
                <span>Eventbrite event detected — attendee import coming soon</span>
              </div>
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
            {eventDescription && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Event Description</label>
                <textarea className="auth-input" style={{ height: '80px', resize: 'vertical', fontSize: '12px' }}
                  value={eventDescription} onChange={e => setEventDescription(e.target.value)} />
              </div>
            )}

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
            </div>

            {(() => {
              const hasAttendees = attendeeText.split('\n').some(l => l.trim().length > 0);
              const disabled = isGenerating || !hasAttendees;
              return (
                <button
                  type="submit"
                  className="btn primary"
                  disabled={disabled}
                  style={{
                    marginTop: '4px',
                    padding: '12px 24px',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGenerating ? 'Generating Intelligence Brief...' : 'Generate Briefing'}
                </button>
              );
            })()}
          </form>
        </Modal>
      )}
    </main>
  );
}
