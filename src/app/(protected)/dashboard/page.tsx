'use client';

import { useState, useMemo } from 'react';
import { useContacts } from '@/lib/hooks/useContacts';
import { useUser } from '@/lib/hooks/useUser';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth } from '@/lib/firebase/config';
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
  const { contacts, isLoading, isError, mutate } = useContacts();
  const { userDoc } = useUser();
  const { user } = useAuth();
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
    } catch (err) {
      console.error('Categorize failed', err);
    } finally {
      setProcessingPhase(null);
      setPhaseProgress(null);
    }
  };

  // Computed Stats
  const stats = useMemo(() => {
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
  }, [contacts]);

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
            <h1 style={{ fontSize: '28px', margin: '0 0 8px 0', color: 'var(--text)' }}>Daymaker Dashboard</h1>
            <div style={{ color: 'var(--text2)', fontSize: '14px' }}>
              Your network intelligence hub. {isLoading ? 'Loading...' : `${stats.total} total contacts.`}
            </div>
          </div>
          <div className="hdr-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer" className="text-btn" style={{ 
              color: 'var(--orange)', 
              fontSize: '14px', 
              textDecoration: 'none',
              fontWeight: 500 
            }}>
              Get New LinkedIn Data ↗
            </a>
            <button className="btn" onClick={() => setShowUpload(true)}>Upload CSV</button>
          </div>
        </div>

        {/* Empty state — no contacts uploaded yet */}
        {!isLoading && stats.total === 0 && (
          <div
            style={{
              marginTop: '48px',
              padding: '48px 32px',
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌅</div>
            <h2
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '24px',
                color: 'var(--text)',
                margin: '0 0 8px 0',
              }}
            >
              Upload your LinkedIn data to get started
            </h2>
            <p
              style={{
                color: 'var(--text2)',
                fontSize: '14px',
                maxWidth: '460px',
                margin: '0 auto 24px',
                lineHeight: 1.6,
              }}
            >
              Import your LinkedIn connections to unlock AI-powered network intelligence, briefings, and Deep Dive analyses.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => setShowUpload(true)} style={{ padding: '10px 20px', fontSize: '14px' }}>
                Upload CSV
              </button>
              <a
                href="https://www.linkedin.com/mypreferences/d/download-my-data"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ padding: '10px 20px', fontSize: '14px', textDecoration: 'none' }}
              >
                Get LinkedIn Export ↗
              </a>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        <div id="sec-dashboard" style={{ marginTop: '32px', display: !isLoading && stats.total === 0 ? 'none' : undefined }}>

          {userDoc?.plan === 'free' && (
            <div style={{
              background: 'var(--orange-dim)',
              border: '1px solid var(--orange)',
              padding: '16px 24px',
              borderRadius: '8px',
              marginBottom: '32px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '15px' }}>Unlock Unlimited AI Intelligence</h4>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>You are on the Free tier. Upgrade to access unlimited AI Agent queries and full network capacity.</div>
              </div>
              <button onClick={handleCheckout} className="btn" style={{ padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}>
                Upgrade to Pro
              </button>
            </div>
          )}

          {/* Your Next Event — event-driven entry point */}
          <NextEventHero />

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
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Emails</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                {isLoading ? '...' : stats.emails.toLocaleString()}
              </div>
            </div>
            <div className="stat-card card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Categorized</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                {isLoading ? '...' : stats.categorized.toLocaleString()}
              </div>
              {!isLoading && stats.total > 0 && (
                <div style={{ marginTop: '2px', fontSize: '10px', color: 'var(--muted)' }}>
                  Index: {stats.embedded.toLocaleString()} / {stats.total.toLocaleString()}
                </div>
              )}
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
                onClick={() => setActiveTab(tab)}
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
            
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
                <div className="loading-spinner" />
              </div>
            ) : (
              <div className="tab-pane active" style={{ padding: '24px' }}>
                {activeTab === 'network' && <SearchTab contacts={contacts} onSelectContact={(c) => setSelectedContact(c)} />}
                {activeTab === 'ai' && (
                  <AiAgentTab
                    onSelectContact={(contactId) => {
                      const c = contacts.find(x => x.contactId === contactId);
                      if (c) setSelectedContact(c);
                    }}
                  />
                )}
                {activeTab === 'categories' && <CategoriesTab contacts={contacts} onSelectContact={(c) => setSelectedContact(c)} />}
                {activeTab === 'companies' && <CompaniesTab contacts={contacts} onSelectContact={(c) => setSelectedContact(c)} />}
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
          mutate(); // Refresh SWR contacts data
          setTimeout(() => setShowUpload(false), 3000); // Close modal 3s after finish
        }} />
      </Modal>

      {/* Contact Detail Modal (AI Generated) */}
      <ContactDetailModal
        contact={selectedContact}
        isOpen={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        northStar={userDoc?.northStar || ''}
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
