'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth, getDb } from '@/lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { useUser } from '@/lib/hooks/useUser';
import type { EventBriefing } from '@/lib/types';

type Source = 'google' | 'microsoft';

interface CalEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
  source: Source;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'starting soon';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const isUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value.trim());

export default function NextEventHero() {
  const { user } = useAuth();
  const { userDoc } = useUser();

  const googleConnected = !!userDoc?.googleCalendarConnected;
  const microsoftConnected = !!userDoc?.microsoftCalendarConnected;
  const anyConnected = googleConnected || microsoftConnected;

  const [loading, setLoading] = useState(anyConnected);
  const [nextEvent, setNextEvent] = useState<CalEvent | null>(null);
  const [briefingId, setBriefingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !anyConnected) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getAuth()?.currentUser?.getIdToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const fetches: Promise<CalEvent[]>[] = [];
        if (googleConnected) {
          fetches.push(
            fetch('/api/calendar/events', { headers })
              .then(r => (r.ok ? r.json() : { events: [] }))
              .then(d => (d.events || []).map((e: any) => ({ ...e, source: 'google' as const })))
              .catch(() => [])
          );
        }
        if (microsoftConnected) {
          fetches.push(
            fetch('/api/calendar/microsoft/events', { headers })
              .then(r => (r.ok ? r.json() : { events: [] }))
              .then(d => (d.events || []).map((e: any) => ({ ...e, source: (e.source || 'microsoft') as Source })))
              .catch(() => [])
          );
        }

        const merged = (await Promise.all(fetches)).flat();
        const now = Date.now();
        const upcoming = merged
          .filter(e => new Date(e.startTime).getTime() >= now)
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        const next = upcoming[0] || null;
        if (cancelled) return;
        setNextEvent(next);

        // Check if a briefing already exists for this event. Briefings don't
        // store the source calendar id, so match by name + same-day date.
        if (next) {
          const db = getDb();
          if (db) {
            const snap = await getDocs(collection(db, 'users', user.uid, 'events'));
            const startDate = new Date(next.startTime);
            const match = snap.docs
              .map(d => d.data() as EventBriefing)
              .find(b => {
                if (!b.eventName || b.eventName.trim().toLowerCase() !== next.title.trim().toLowerCase()) return false;
                const raw: any = b.eventDate;
                if (!raw) return false;
                const bDate = raw.toDate ? raw.toDate() : new Date(raw.seconds ? raw.seconds * 1000 : raw);
                return sameDay(bDate, startDate);
              });
            if (!cancelled) setBriefingId(match?.eventId || null);
          }
        }
      } catch (err) {
        console.error('[NextEventHero] load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid, anyConnected, googleConnected, microsoftConnected]);

  const countdown = useMemo(() => {
    if (!nextEvent) return '';
    return formatCountdown(new Date(nextEvent.startTime).getTime() - Date.now());
  }, [nextEvent]);

  const sourceBadge = nextEvent && (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        background: nextEvent.source === 'google' ? 'rgba(66, 133, 244, 0.12)' : 'rgba(0, 120, 212, 0.12)',
        color: nextEvent.source === 'google' ? '#8ab4f8' : '#4cc2ff',
        border: `1px solid ${nextEvent.source === 'google' ? 'rgba(66, 133, 244, 0.3)' : 'rgba(0, 120, 212, 0.3)'}`,
      }}
    >
      {nextEvent.source === 'google' ? 'Google' : 'Outlook'}
    </span>
  );

  const cardBase: React.CSSProperties = {
    position: 'relative',
    padding: '32px',
    background: 'linear-gradient(180deg, rgba(249, 148, 30, 0.04) 0%, var(--surface) 60%)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '32px',
  };

  const topBorder: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'linear-gradient(90deg, var(--orange), rgba(249, 148, 30, 0.2))',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    color: 'var(--orange)',
    marginBottom: '12px',
  };

  // State 1: Calendar not connected
  if (!anyConnected) {
    return (
      <div style={cardBase}>
        <div style={topBorder} />
        <div style={sectionLabel}>Your Next Event</div>
        <div style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '26px',
          color: 'var(--text)',
          marginBottom: '8px',
          lineHeight: 1.2,
        }}>
          Connect your calendar to unlock event intelligence
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '14px', maxWidth: '560px', lineHeight: 1.6, marginBottom: '20px' }}>
          Connect your calendar to see upcoming events and generate AI briefings that prep you on attendees before you walk in.
        </p>
        <Link href="/events" className="btn primary" style={{ padding: '12px 24px', fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}>
          Connect Calendar
        </Link>
      </div>
    );
  }

  // State 2: Loading calendar events
  if (loading) {
    return (
      <div style={cardBase}>
        <div style={topBorder} />
        <div style={sectionLabel}>Your Next Event</div>
        <div style={{ color: 'var(--text2)', fontSize: '14px', padding: '16px 0' }}>Loading upcoming events...</div>
      </div>
    );
  }

  // State 3: Connected, no upcoming events
  if (!nextEvent) {
    return (
      <div style={cardBase}>
        <div style={topBorder} />
        <div style={sectionLabel}>Your Next Event</div>
        <div style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '26px',
          color: 'var(--text)',
          marginBottom: '8px',
          lineHeight: 1.2,
        }}>
          No upcoming events on your calendar
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '14px', maxWidth: '560px', lineHeight: 1.6, marginBottom: '20px' }}>
          Create a manual event briefing for a gathering that isn&apos;t on your calendar — just paste the attendee list.
        </p>
        <Link href="/events" className="btn primary" style={{ padding: '12px 24px', fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}>
          Create Manual Briefing
        </Link>
      </div>
    );
  }

  // State 4: Upcoming event — either brief exists or needs generating
  return (
    <div style={cardBase}>
      <div style={topBorder} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={sectionLabel}>Your Next Event</span>
            {sourceBadge}
          </div>
          <div style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '32px',
            color: 'var(--text)',
            marginBottom: '12px',
            lineHeight: 1.15,
            wordBreak: 'break-word',
          }}>
            {nextEvent.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', color: 'var(--text2)', fontSize: '14px' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--orange)', fontWeight: 600 }}>
              {countdown}
            </span>
            <span>·</span>
            <span>{formatEventWhen(nextEvent.startTime)}</span>
            {nextEvent.location && (
              <>
                <span>·</span>
                {isUrl(nextEvent.location) ? (
                  <a
                    href={nextEvent.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--muted)',
                      textDecoration: 'underline',
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {nextEvent.location}
                  </a>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>{nextEvent.location}</span>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          {briefingId ? (
            <Link
              href={`/events/${briefingId}`}
              className="btn"
              style={{
                padding: '14px 24px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(46, 204, 113, 0.12)',
                color: 'var(--green)',
                border: '1px solid rgba(46, 204, 113, 0.4)',
              }}
            >
              Pre-Brief Ready ✓
            </Link>
          ) : (
            <Link
              href="/events"
              className="btn primary"
              style={{ padding: '14px 24px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
            >
              Generate Pre-Brief
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
