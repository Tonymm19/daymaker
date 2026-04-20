'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useUser } from '@/lib/hooks/useUser';
import { getDb } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import type { EventBriefing, EventAttendee } from '@/lib/types';

type FilterState = 'All' | 'Must Meet' | 'Worth Meeting' | 'Your Anchors' | 'New Connections';

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const { userDoc, isLoading: userLoading } = useUser();
  const [briefing, setBriefing] = useState<EventBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>('All');
  
  // Track which cards are expanded by attendee ID (index works if stable)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadBriefing() {
      if (!user?.uid || !params.id) return;
      try {
        const db = getDb();
        if (!db) return;

        const docRef = doc(db, 'users', user.uid, 'events', params.id as string);
        const snapshot = await getDoc(docRef);
        
        if (snapshot.exists()) {
          setBriefing(snapshot.data() as EventBriefing);
        } else {
          router.replace('/events'); // Not found
        }
      } catch (err) {
        console.error("Failed to load briefing", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadBriefing();
  }, [user, params, router]);

  const toggleExpand = (index: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (isLoading || userLoading) {
    return (
      <main style={{ padding: '32px' }}>
        <div style={{ color: 'var(--text2)' }}>Loading Intelligence Briefing...</div>
      </main>
    );
  }

  if (!briefing) return null;

  // Filter & Sort attendees
  let filteredAttendees = [...(briefing.attendees || [])].sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  if (filter === 'Must Meet') {
    filteredAttendees = filteredAttendees.filter(a => a.connectionType === 'must_meet');
  } else if (filter === 'Worth Meeting') {
    filteredAttendees = filteredAttendees.filter(a => a.connectionType === 'worth_meeting');
  } else if (filter === 'Your Anchors') {
    filteredAttendees = filteredAttendees.filter(a => a.isInNetwork);
  } else if (filter === 'New Connections') {
    filteredAttendees = filteredAttendees.filter(a => !a.isInNetwork);
  }

  const dateStr = briefing.eventDate 
    ? new Date(briefing.eventDate.seconds * 1000).toLocaleDateString()
    : 'No Date';

  return (
    <main style={{ padding: '32px' }}>
      {/* Navigation */}
      <div style={{ marginBottom: '24px' }}>
        <button 
          onClick={() => router.push('/events')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 0, fontSize: '13px' }}
        >
          ← Back to Events
        </button>
      </div>

      {/* Header Block */}
      <div id="sec-prebrief" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '32px', margin: '0 0 8px 0', color: 'var(--text)' }}>
              {briefing.eventName}
            </h1>
            <div style={{ color: 'var(--text2)', fontSize: '15px' }}>
              Intelligence Briefing &middot; {briefing.eventLocation || 'Unknown Location'} &middot; {dateStr}
            </div>
          </div>
          <div style={{ background: 'var(--surface-color)', padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)' }}>{briefing.attendees?.length || 0}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attendees</div>
          </div>
        </div>
      </div>

      {/* Tip if No North Star */}
      {!userDoc?.northStar && (
        <div style={{ background: 'var(--orange-dim)', border: '1px solid var(--orange)', borderRadius: '6px', padding: '16px', marginBottom: '24px', fontSize: '13px', color: 'var(--text)' }}>
          <strong style={{ color: 'var(--orange)' }}>💡 Pro Tip:</strong> Set your <strong>North Star</strong> in your Profile to get more targeted recommendations instead of generalized networking tips.
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {(['All', 'Must Meet', 'Worth Meeting', 'Your Anchors', 'New Connections'] as FilterState[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: '1px solid',
              background: filter === f ? ((f === 'Must Meet' || f === 'Your Anchors') ? 'var(--orange-dim)' : 'var(--blue-dim)') : 'var(--surface-color)',
              borderColor: filter === f ? ((f === 'Must Meet' || f === 'Your Anchors') ? 'var(--orange)' : 'var(--blue)') : 'var(--border)',
              color: filter === f ? ((f === 'Must Meet' || f === 'Your Anchors') ? 'var(--orange)' : 'var(--blue)') : 'var(--text2)',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: filter === f ? 600 : 400,
              transition: 'all 0.2s'
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Attendees Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredAttendees.length === 0 ? (
          <div style={{ color: 'var(--text2)', textAlign: 'center', padding: '32px' }}>
            No attendees match this filter.
          </div>
        ) : (
          filteredAttendees.map((att, idx) => {
            const isExpanded = expandedCards.has(idx);
            return (
              <div 
                key={idx}
                className="attendee-card"
                style={{
                  background: 'var(--surface-color)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}
              >
                {/* Header (Always Visible) */}
                <div 
                  className="att-header"
                  onClick={() => toggleExpand(idx)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--darker)' : 'transparent',
                    transition: 'background 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div 
                      className="att-rank"
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: att.relevanceScore >= 80 ? 'linear-gradient(135deg, var(--orange), #ff4d00)' : 'var(--border)',
                        color: att.relevanceScore >= 80 ? '#fff' : 'var(--text2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 700
                      }}
                    >
                      {att.relevanceScore}
                    </div>
                    <div>
                      <h4 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '20px', color: 'var(--text)', margin: '0 0 4px 0' }}>
                        {att.name}
                      </h4>
                      <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                        {att.position} <span style={{ color: 'var(--orange)' }}>@ {att.company}</span>
                      </div>
                      {!att.photoUrl && att.linkedInUrl && (
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px', fontStyle: 'italic' }}>
                          Click to view their LinkedIn profile
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="score-bar-w" style={{ width: '80px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div className="score-fill" style={{ width: `${att.relevanceScore}%`, height: '100%', background: att.relevanceScore >= 80 ? 'var(--orange)' : 'var(--text2)' }} />
                    </div>
                    
                    <div 
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s',
                        color: 'var(--text2)'
                      }}
                    >
                      ▼
                    </div>
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <div
                    className="att-body"
                    style={{
                      padding: '24px 20px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '24px'
                    }}
                  >
                    {/* Action Row: LinkedIn + Deep Dive */}
                    {(att.linkedInUrl || att.contactId) && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {att.linkedInUrl && (
                          <a
                            href={att.linkedInUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 16px',
                              background: '#0A66C2',
                              color: '#ffffff',
                              borderRadius: '999px',
                              fontSize: '13px',
                              fontWeight: 600,
                              textDecoration: 'none',
                              transition: 'background 0.2s',
                            }}
                            onMouseOver={e => (e.currentTarget.style.background = '#0956a6')}
                            onMouseOut={e => (e.currentTarget.style.background = '#0A66C2')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            </svg>
                            View LinkedIn Profile
                          </a>
                        )}
                        {att.contactId && (
                          <a
                            href={`/deepdive/new?contactId=${att.contactId}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 16px',
                              background: 'var(--orange)',
                              color: '#0F0E0C',
                              borderRadius: '999px',
                              fontSize: '13px',
                              fontWeight: 700,
                              textDecoration: 'none',
                              transition: 'filter 0.2s',
                            }}
                            onMouseOver={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
                            onMouseOut={e => (e.currentTarget.style.filter = 'brightness(1)')}
                          >
                            🔍 Deep Dive
                          </a>
                        )}
                      </div>
                    )}

                    {/* Why They Matter */}
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                        Why They Matter
                      </div>
                      <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
                        {att.whyTheyMatter}
                      </p>
                    </div>

                    {/* Conversation Starters */}
                    <div className="section-box activity" style={{ background: 'var(--surface-color)', borderLeft: '3px solid var(--blue)', padding: '16px', borderRadius: '0 6px 6px 0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                        Conversation Starters
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {att.conversationStarters?.map((starter, sIdx) => (
                          <div key={sIdx} className="starter" style={{ display: 'flex', gap: '12px' }}>
                            <span className="starter-num" style={{ color: 'var(--orange)', fontWeight: 600 }}>{sIdx + 1}.</span>
                            <span className="starter-text" style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                              {starter}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                      {/* Network Gap Analysis */}
                      <div className="section-box warning" style={{ background: 'var(--red-dim)', borderLeft: '3px solid var(--red)', padding: '16px', borderRadius: '0 6px 6px 0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                          Network Gap Map
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                          {att.networkGapAnalysis}
                        </p>
                      </div>

                      {/* Follow-Up Strategy */}
                      <div className="section-box followup-box" style={{ background: 'rgba(39, 174, 96, 0.1)', borderLeft: '3px solid var(--green)', padding: '16px', borderRadius: '0 6px 6px 0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                          Follow-Up Strategy
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                          {att.followUpRecommendation}
                        </p>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </main>
  );
}
