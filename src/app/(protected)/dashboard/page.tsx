'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useContacts } from '@/lib/hooks/useContacts';
import { useUser } from '@/lib/hooks/useUser';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth, getDb } from '@/lib/firebase/config';
import { doc as fsDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import Modal from '@/components/ui/Modal';
import CsvUpload from '@/components/import/CsvUpload';
import ContactDetailModal from '@/components/dashboard/ContactDetailModal';
import { Contact } from '@/lib/types';

// Sub-tabs
import SearchTab from '@/components/dashboard/tabs/SearchTab';
import AiAgentTab from '@/components/dashboard/tabs/AiAgentTab';
import CategoriesTab from '@/components/dashboard/tabs/CategoriesTab';
import CompaniesTab from '@/components/dashboard/tabs/CompaniesTab';
import NextEventHero from '@/components/dashboard/NextEventHero';

type Tab = 'network' | 'ai' | 'categories' | 'companies';

const TAB_LABELS: Record<Tab, string> = {
  network: 'Network',
  ai: 'AI Agent',
  categories: 'Categories',
  companies: 'Companies',
};

export default function DashboardPage() {
  // Start the dashboard by loading only 50 most-recent contacts so first paint
  // is fast on ~9k-contact networks. `fullLoadRequested` flips to true the
  // moment a feature actually needs the full set (search, Categories/Companies
  // aggregations, AI-result contact lookups, or a manual Load More).
  const [fullLoadRequested, setFullLoadRequested] = useState(false);
  const contactMode = fullLoadRequested ? 'full' : 'recent';
  const { contacts, isLoading, isError, mutate } = useContacts({ mode: contactMode, recentLimit: 50 });
  const requestFullLoad = () => setFullLoadRequested(true);

  const { userDoc, mutate: mutateUser } = useUser();
  const { user } = useAuth();

  // Hide filter — derived once from the user's hiddenContacts array. Applied to
  // every tab so no hidden contact shows up in Network, Categories, Companies,
  // or the AI Agent result click-through. Server-side routes filter as well.
  const hiddenSet = useMemo(
    () => new Set(userDoc?.hiddenContacts || []),
    [userDoc?.hiddenContacts],
  );
  const visibleContacts = useMemo(
    () => (hiddenSet.size === 0 ? contacts : contacts.filter((c) => !hiddenSet.has(c.contactId))),
    [contacts, hiddenSet],
  );

  const handleHideContact = useCallback(
    async (contactId: string) => {
      if (!user) return;
      const db = getDb();
      if (!db) return;
      try {
        await updateDoc(fsDoc(db, 'users', user.uid), {
          hiddenContacts: arrayUnion(contactId),
          updatedAt: new Date(),
        });
        await mutateUser();
      } catch (err) {
        console.error('Failed to hide contact', err);
      }
    },
    [user, mutateUser],
  );

  const [activeTab, setActiveTab] = useState<Tab>('network');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  
  // Combined state for categorize + embedding phases. The flows run as a
  // two-phase pipeline ("Categorizing…" → "Building AI search index…") so a
  // single phase indicator keeps the UI honest about what's actually running.
  const [processingPhase, setProcessingPhase] = useState<'categorizing' | 'embedding' | null>(null);
  const [phaseProgress, setPhaseProgress] = useState<{ done: number; total: number } | null>(null);
  const isProcessing = processingPhase !== null;

  const handleCheckout = async () => {
    if (!user) return;
    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout failed", err);
    }
  };

  // Inner embedding loop — no lifecycle management so it can be chained from
  // other handlers (e.g. handleCategorize) without clobbering their phase state.
  const runEmbeddingLoop = async (token: string) => {
    const LIMIT_PER_ROUND = 200;
    const errors: string[] = [];
    let totalDone = 0;
    let totalTarget = 0;
    setProcessingPhase('embedding');
    setPhaseProgress(null);

    for (let round = 0; round < 200; round++) {
      const res = await fetch('/api/ai/embed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: LIMIT_PER_ROUND }),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errPayload.error || `Embedding failed (HTTP ${res.status})`);
      }

      const data = await res.json() as { embedded: number; remaining: number; errors?: string[] };
      totalDone += data.embedded;
      totalTarget = totalDone + data.remaining;
      setPhaseProgress({ done: totalDone, total: totalTarget });
      if (data.errors?.length) errors.push(...data.errors);

      if (data.remaining <= 0) break;
      if (data.embedded === 0) {
        errors.push('Stopped early: a round completed without embedding any contacts.');
        break;
      }
    }

    if (errors.length) console.warn('[Embed] Errors during run:', errors);
  };

  // Build the vector search index for any contacts missing embeddings. Loops
  // until the server reports zero remaining so it works for any network size.
  const handleBuildIndex = async () => {
    if (!user) return;
    setProcessingPhase('embedding');
    setPhaseProgress(null);

    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');
      await runEmbeddingLoop(token);
      mutate();
      mutateUser();
    } catch (err) {
      console.error('Build index failed', err);
    } finally {
      setProcessingPhase(null);
      setPhaseProgress(null);
    }
  };

  const handleCategorize = async () => {
    if (!user) return;
    setProcessingPhase('categorizing');
    setPhaseProgress(null);

    // Chunk size per request — 4 batches of 50 contacts fits well under a
    // 60s serverless timeout. Drop to 100 if you're seeing timeouts.
    const LIMIT_PER_ROUND = 200;
    const errors: string[] = [];
    let totalDone = 0;
    let totalTarget = 0;

    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      // Loop until the server reports zero remaining — resumable across page reloads
      // because uncategorized contacts are identified by `categories == []` in Firestore.
      // Hard stop at 100 rounds as a safety net against infinite loops.
      for (let round = 0; round < 100; round++) {
        const res = await fetch('/api/ai/categorize-batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ limit: LIMIT_PER_ROUND }),
        });

        if (!res.ok) {
          const errPayload = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errPayload.error || `Categorization failed (HTTP ${res.status})`);
        }

        const data = await res.json() as { categorized: number; remaining: number; errors?: string[] };
        totalDone += data.categorized;
        totalTarget = totalDone + data.remaining;
        setPhaseProgress({ done: totalDone, total: totalTarget });
        if (data.errors?.length) errors.push(...data.errors);

        if (data.remaining <= 0) break;
        // Stop if a round made no progress (all batches failed) — avoid an infinite retry loop.
        if (data.categorized === 0) {
          errors.push('Stopped early: a round completed without categorizing any contacts.');
          break;
        }
      }

      if (errors.length) console.warn('[Categorize] Errors during run:', errors);

      // Phase 2: immediately build the AI search index for any contacts that
      // are now categorized but still missing vectors. Runs inline so users
      // don't have to click a second button.
      try {
        await runEmbeddingLoop(token);
      } catch (embedErr) {
        console.error('Embedding phase failed', embedErr);
      }

      mutate();
      mutateUser();
    } catch (err) {
      console.error('Categorize failed', err);
    } finally {
      setProcessingPhase(null);
      setPhaseProgress(null);
    }
  };

  // Stats: prefer the cached contactStats on the user doc (fast — one doc read)
  // and fall back to client-computed counts while the backfill runs or for
  // users whose stats haven't been cached yet.
  const stats = useMemo(() => {
    if (userDoc?.contactStats) {
      const s = userDoc.contactStats;
      return {
        total: s.total ?? 0,
        companies: s.companies ?? 0,
        emails: s.emails ?? 0,
        categorized: s.categorized ?? 0,
        embedded: s.embedded ?? 0,
      };
    }
    if (!contacts) return { total: 0, companies: 0, emails: 0, categorized: 0, embedded: 0 };

    const total = contacts.length;
    let emails = 0;
    let categorized = 0;
    let embedded = 0;
    const companiesSet = new Set<string>();

    contacts.forEach(c => {
      if (c.email && c.email.includes('@')) emails++;
      if (c.categories && c.categories.length > 0) categorized++;
      if (Array.isArray(c.embedding) && c.embedding.length > 0) embedded++;
      if (c.company) companiesSet.add(c.company.trim());
    });

    return {
      total,
      companies: companiesSet.size,
      emails,
      categorized,
      embedded,
    };
  }, [userDoc?.contactStats, contacts]);

  // Backfill cached stats once for users who have contacts but no
  // contactStats object yet. Guards against repeated calls with a ref so
  // re-renders don't retrigger the recompute.
  const statsBackfillFired = useRef(false);
  useEffect(() => {
    if (statsBackfillFired.current) return;
    if (!user || !userDoc) return;
    if (userDoc.contactStats) return;
    if ((userDoc.contactCount ?? 0) <= 0) return;
    statsBackfillFired.current = true;

    (async () => {
      try {
        const auth = getAuth();
        const token = await auth?.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/contacts/stats/refresh', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) mutateUser();
      } catch (err) {
        console.warn('Stats backfill failed', err);
      }
    })();
  }, [user, userDoc, mutateUser]);

  return (
    <>
      <div className="main">
        {/* Dashboard Header */}
        <div className="dash-hdr" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '32px 0 24px 0', 
          borderBottom: '1px solid var(--border)' 
        }}>
          <div>
            <h1 style={{ fontSize: '28px', margin: '0 0 8px 0', color: 'var(--text)' }}>Home</h1>
            <div style={{ color: 'var(--text2)', fontSize: '14px' }}>
              Your network intelligence hub. {isLoading ? 'Loading...' : `${stats.total} total contacts.`}
            </div>
          </div>
          <div className="hdr-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer" className="text-btn" style={{
                color: 'var(--orange)',
                fontSize: '14px',
                textDecoration: 'none',
                fontWeight: 500
              }}>
                Refresh LinkedIn Data ↗
              </a>
              {(() => {
                const ts = userDoc?.linkedInImportedAt;
                if (!ts) {
                  return <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No refresh history</span>;
                }
                const importedMs = ts.seconds * 1000;
                const days = Math.floor((Date.now() - importedMs) / 86_400_000);
                let label: string;
                let color: string;
                if (days <= 0) {
                  label = 'Refreshed today';
                  color = 'var(--green)';
                } else if (days === 1) {
                  label = '1 day since last refresh';
                  color = 'var(--green)';
                } else {
                  label = `${days} days since last refresh`;
                  color = days < 15 ? 'var(--green)' : days < 30 ? 'var(--blue)' : 'var(--red)';
                }
                return <span style={{ fontSize: '12px', color }}>{label}</span>;
              })()}
            </div>
            <button className="btn" onClick={() => setShowUpload(true)}>Upload CSV</button>
          </div>
        </div>

        {/* First-paint skeleton — user doc and contacts are still resolving.
            Replaces the stat-bar-with-"..."s and blank tab area so there's
            something shimmer-y to look at rather than a bare page. */}
        {!userDoc && isLoading && (
          <div style={{ marginTop: '32px' }}>
            <div className="skeleton skeleton-hero" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '8px',
                marginBottom: '24px',
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton skeleton-stat" />
              ))}
            </div>
            <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }} />
            <div className="skeleton" style={{ height: '220px' }} />
          </div>
        )}

        {/* Guided setup — shown until the user has uploaded any contacts. */}
        {userDoc && !isLoading && stats.total === 0 && (
          <GuidedSetup
            userDoc={userDoc}
            onUpload={() => setShowUpload(true)}
          />
        )}

        {/* Subtle nudge for returning users who have contacts but no North Star. */}
        {userDoc && !isLoading && stats.total > 0 && !userDoc?.northStar && (
          <div
            style={{
              marginTop: '20px',
              padding: '12px 16px',
              background: 'var(--orange-dim)',
              border: '1px solid var(--orange)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              fontSize: '13px',
              color: 'var(--text)',
            }}
          >
            <span>
              <strong style={{ color: 'var(--orange)' }}>Tip:</strong> Set your North Star to get more targeted results.
            </span>
            <a href="/settings" style={{ color: 'var(--orange)', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
              Go to Profile →
            </a>
          </div>
        )}

        {/* Dashboard Content */}
        <div id="sec-dashboard" style={{
          marginTop: '32px',
          display: (!userDoc && isLoading) || (!isLoading && stats.total === 0) ? 'none' : undefined,
        }}>

          {/* Your Next Event — event-driven entry point. Primary action, so it
              sits above the upsell banner. */}
          <NextEventHero />

          {userDoc?.plan === 'free' && (
            <div style={{
              background: 'var(--orange-dim)',
              border: '1px solid var(--orange)',
              padding: '16px 24px',
              borderRadius: '8px',
              margin: '24px 0 32px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}>
              <div>
                <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '15px' }}>Unlock Unlimited AI Intelligence</h4>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Free tier: 3 AI queries, 1 Deep Dive, 0 event briefings per month. Upgrade for unlimited access.</div>
              </div>
              <button onClick={handleCheckout} className="btn" style={{ padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}>
                Upgrade to Pro
              </button>
            </div>
          )}

          {/* Compact Quick Stats — reference data, not the lead */}
          <div className="stat-bar" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px',
            marginBottom: '24px',
          }}>
            <div className="stat-card card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Contacts</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                {isLoading ? '...' : stats.total.toLocaleString()}
              </div>
            </div>
            <div className="stat-card card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Companies</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                {isLoading ? '...' : stats.companies.toLocaleString()}
              </div>
            </div>
            <div className="stat-card card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Categorized</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                {isLoading ? '...' : stats.categorized.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Data maintenance controls — moved out of the stats card to keep the bar compact */}
          {!isLoading && stats.total > 0 && (isProcessing || stats.categorized < stats.total || stats.embedded < stats.total) && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px', fontSize: '12px' }}>
              {isProcessing ? (
                <span style={{ color: 'var(--orange)', fontWeight: 600 }}>
                  {processingPhase === 'categorizing' ? 'Categorizing contacts' : 'Building AI search index'}
                  {phaseProgress
                    ? ` ${phaseProgress.done.toLocaleString()} / ${phaseProgress.total.toLocaleString()}...`
                    : '...'}
                </span>
              ) : (
                <>
                  {stats.categorized < stats.total && (
                    <button onClick={handleCategorize} style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      Categorize Now
                    </button>
                  )}
                  {stats.embedded < stats.total && (
                    <button
                      onClick={handleBuildIndex}
                      title={stats.embedded === 0
                        ? 'Generate vector embeddings so AI Agent search works across your full network.'
                        : `Finish generating embeddings for the remaining ${(stats.total - stats.embedded).toLocaleString()} contacts.`}
                      style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      Generate Search Index
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sub Navigation */}
          <div className="dash-nav" style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid var(--border)'
          }}>
            {(['network', 'ai', 'categories', 'companies'] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`dash-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab);
                  // Categories/Companies aggregate counts across the full
                  // network; AI result clicks resolve contactIds from the
                  // loaded contacts array. All three need the full load.
                  if (tab !== 'network') requestFullLoad();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeTab === tab ? 'var(--orange)' : 'var(--text2)',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  borderBottom: activeTab === tab ? '2px solid var(--orange)' : '2px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Tab Content Areas */}
          <div className="dash-content-area" style={{ minHeight: '500px' }}>
            {isError && (
              <div style={{ color: 'var(--red)', padding: '24px', background: 'var(--red-dim)', borderRadius: '8px' }}>
                Error loading contacts. Please refresh the page.
              </div>
            )}
            
            {isLoading && contacts.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
                <div className="loading-spinner" />
              </div>
            ) : (
              <div className="tab-pane active" style={{ padding: '24px' }}>
                {activeTab === 'network' && (
                  <SearchTab
                    contacts={visibleContacts}
                    isPartial={contactMode === 'recent'}
                    isLoadingFull={fullLoadRequested && isLoading}
                    onRequestFullLoad={requestFullLoad}
                    onSelectContact={(c) => setSelectedContact(c)}
                    onHideContact={handleHideContact}
                  />
                )}
                {activeTab === 'ai' && (
                  <AiAgentTab
                    onSelectContact={(contactId) => {
                      if (hiddenSet.has(contactId)) return;
                      const c = contacts.find(x => x.contactId === contactId);
                      if (c) setSelectedContact(c);
                    }}
                  />
                )}
                {activeTab === 'categories' && (
                  fullLoadRequested && isLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--muted)', padding: '24px' }}>
                      <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }} />
                      <span>Loading full network for category breakdown...</span>
                    </div>
                  ) : (
                    <CategoriesTab contacts={visibleContacts} onSelectContact={(c) => setSelectedContact(c)} onHideContact={handleHideContact} />
                  )
                )}
                {activeTab === 'companies' && (
                  fullLoadRequested && isLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--muted)', padding: '24px' }}>
                      <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }} />
                      <span>Loading full network for company breakdown...</span>
                    </div>
                  ) : (
                    <CompaniesTab contacts={visibleContacts} onSelectContact={(c) => setSelectedContact(c)} onHideContact={handleHideContact} />
                  )
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* CSV Upload Modal */}
      <Modal 
        isOpen={showUpload} 
        onClose={() => setShowUpload(false)} 
        title="Upload LinkedIn Connections"
      >
        <CsvUpload onComplete={() => {
          mutate();
          mutateUser();
          setTimeout(() => setShowUpload(false), 3000);
        }} />
      </Modal>

      {/* Contact Detail Modal (AI Generated) */}
      <ContactDetailModal
        contact={selectedContact}
        isOpen={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        northStar={userDoc?.northStar || ''}
        currentGoal={userDoc?.currentGoal || ''}
        connectionType={userDoc?.connectionType || ''}
        onStartersUpdated={(contactId, starters) => {
          // Optimistically patch the SWR contacts cache so the next modal open
          // for this contact reads the saved starters without refetching.
          mutate(
            (current) => (current || []).map(c =>
              c.contactId === contactId ? { ...c, conversationStarters: starters } : c
            ),
            { revalidate: false },
          );
          // Reflect the change in the currently-open modal's selectedContact
          // reference so Regenerate from this session keeps the latest.
          setSelectedContact(prev =>
            prev && prev.contactId === contactId
              ? { ...prev, conversationStarters: starters }
              : prev,
          );
        }}
      />
    </>
  );
}

// ============================================================================
// GuidedSetup — 4-step onboarding card shown until the user uploads contacts.
// Steps check completion in real-time against the current user doc so
// uploading data or setting a goal in another tab ticks the box immediately.
// ============================================================================

interface GuidedSetupProps {
  userDoc: ReturnType<typeof useUser>['userDoc'];
  onUpload: () => void;
}

function GuidedSetup({ userDoc, onUpload }: GuidedSetupProps) {
  const hasContacts = (userDoc?.contactCount ?? 0) > 0;
  const hasNorthStar = !!userDoc?.northStar?.trim();
  const hasCurrentGoal = !!userDoc?.currentGoal?.trim();
  const hasCalendar = !!(userDoc?.googleCalendarConnected || userDoc?.microsoftCalendarConnected);

  const steps = [
    {
      title: 'Upload your LinkedIn data',
      body: 'Import your connections to unlock the network intelligence tools.',
      done: hasContacts,
      cta: (
        <button className="btn primary" onClick={onUpload} style={{ padding: '8px 16px', fontSize: '13px' }}>
          Upload CSV
        </button>
      ),
    },
    {
      title: 'Set your North Star goal',
      body: 'Your long-term direction — anchors every AI recommendation.',
      done: hasNorthStar,
      cta: (
        <a href="/settings" className="btn" style={{ padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}>
          Open Profile
        </a>
      ),
    },
    {
      title: 'Set your current goal',
      body: "What you're working toward right now. Guides short-horizon suggestions.",
      done: hasCurrentGoal,
      cta: (
        <a href="/settings" className="btn" style={{ padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}>
          Open Profile
        </a>
      ),
    },
    {
      title: 'Connect your calendar',
      body: 'Auto-import upcoming events for pre-briefings.',
      done: hasCalendar,
      cta: (
        <a href="/events" className="btn" style={{ padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}>
          Event Pre-Brief
        </a>
      ),
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <div
      style={{
        marginTop: '32px',
        padding: '32px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span style={{ fontSize: '32px' }}>🌅</span>
        <h2
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '24px',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          Let&apos;s get your network set up
        </h2>
      </div>
      <p style={{ color: 'var(--text2)', fontSize: '14px', margin: '0 0 24px 0', lineHeight: 1.6 }}>
        Four quick steps and you&apos;re ready to turn your contacts into actionable intelligence.
        {' '}
        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>({completedCount}/{steps.length} complete)</span>
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {steps.map((step, idx) => (
          <li
            key={step.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: step.done ? 'var(--green-dim)' : 'var(--darker)',
              border: `1px solid ${step.done ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: step.done ? 'var(--green)' : 'var(--surface)',
                color: step.done ? 'var(--darker)' : 'var(--muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '14px',
                flexShrink: 0,
                fontFamily: "'JetBrains Mono', monospace",
              }}
              aria-hidden="true"
            >
              {step.done ? '✓' : idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{step.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>{step.body}</div>
            </div>
            <div style={{ flexShrink: 0 }}>{step.done ? (
              <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Done</span>
            ) : step.cta}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
