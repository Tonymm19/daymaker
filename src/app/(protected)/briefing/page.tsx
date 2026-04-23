'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useUser } from '@/lib/hooks/useUser';
import { getDb } from '@/lib/firebase/config';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { MonthlyBriefing } from '@/lib/types';
import Link from 'next/link';

export default function BriefingPage() {
  const { user } = useAuth();
  const { userDoc } = useUser();
  const [briefing, setBriefing] = useState<MonthlyBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sparklineData, setSparklineData] = useState<number[]>([]);
  // Stepped status text during generation. There's no real backend progress
  // signal (/api/briefing/generate is a single request/response), but the
  // text updates make the ~30s wait feel less like a frozen skeleton. Matches
  // the PHASE_LABELS pattern in AiAgentTab.
  const [generationPhase, setGenerationPhase] = useState(0);
  
  const currentMonthDate = new Date();
  const monthString = `${currentMonthDate.getFullYear()}-${(currentMonthDate.getMonth() + 1).toString().padStart(2, '0')}`;
  
  // Pretty target strings
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const displayMonthStr = `${monthNames[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`;

  useEffect(() => {
    async function loadData() {
      if (!user?.uid) return;
      try {
        const db = getDb();
        if (!db) return;

        // Load Briefing
        const bRef = doc(db, 'users', user.uid, 'briefings', monthString);
        const bSnap = await getDoc(bRef);
        if (bSnap.exists()) {
          setBriefing(bSnap.data() as MonthlyBriefing);
        } else {
          setBriefing(null);
        }

        // Load sparkline histogram from the server endpoint. The page used to
        // enumerate every contact doc via the Web SDK (which has no field
        // projection) just to count connections per month, which shipped the
        // full 1,536-dim embedding array per contact to the browser. The
        // server endpoint uses the admin SDK's .select('connectedOn') so the
        // payload is ~15 integers.
        try {
          const token = await getAuth().currentUser?.getIdToken();
          const res = await fetch('/api/briefing/sparkline', {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.sparkline)) setSparklineData(data.sparkline);
          }
        } catch (sparkErr) {
          console.warn('Sparkline fetch failed', sparkErr);
        }

      } catch (err) {
        console.error("Failed to load briefing", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user, monthString]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/briefing/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ month: monthString })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBriefing(data.briefing);
    } catch (err) {
      console.error(err);
      alert('Generation Failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Advance phase text while isGenerating. Timers cleared on unmount / when
  // generation finishes so the text never flashes a later stage after early
  // completion.
  useEffect(() => {
    if (!isGenerating) {
      setGenerationPhase(0);
      return;
    }
    const t1 = setTimeout(() => setGenerationPhase(1), 5000);
    const t2 = setTimeout(() => setGenerationPhase(2), 15000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isGenerating]);

  const GENERATION_PHASE_LABELS = [
    'Loading your network...',
    'Analyzing connections...',
    'Generating insights...',
  ];

  const maxSpark = Math.max(...sparklineData, 1);

  if (isLoading) {
    return <main style={{ padding: '32px' }}><div style={{ color: 'var(--text2)' }}>Loading Briefing...</div></main>;
  }

  // SKELETON LOADER
  if (isGenerating) {
    return (
      <main style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '24px',
            color: 'var(--text)',
            fontSize: '14px',
            fontWeight: 500,
          }}
          aria-live="polite"
        >
          <div
            className="loading-spinner"
            style={{ width: '16px', height: '16px', borderWidth: '2px' }}
          />
          <span>{GENERATION_PHASE_LABELS[generationPhase]}</span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="skeleton" style={{ width: '150px', height: '14px', margin: '0 auto 8px', borderRadius: '4px' }}></div>
          <div className="skeleton" style={{ width: '400px', height: '32px', margin: '0 auto 16px', borderRadius: '4px' }}></div>
          <div className="skeleton" style={{ width: '600px', height: '60px', margin: '0 auto', borderRadius: '4px' }}></div>
        </div>
        
        <div className="briefing-section">
          <div className="skeleton" style={{ width: '80px', height: '14px', marginBottom: '8px', borderRadius: '4px' }}></div>
          <div className="skeleton" style={{ width: '200px', height: '24px', marginBottom: '24px', borderRadius: '4px' }}></div>
          <div className="stats-grid">
            {[1,2,3,4].map(i => <div key={i} className="skeleton stat-card" style={{ height: '120px' }}></div>)}
          </div>
        </div>

        <div className="briefing-section">
          <div className="skeleton" style={{ width: '80px', height: '14px', marginBottom: '8px', borderRadius: '4px' }}></div>
          <div className="skeleton" style={{ width: '200px', height: '24px', marginBottom: '8px', borderRadius: '4px' }}></div>
          <div className="skeleton" style={{ width: '300px', height: '14px', marginBottom: '24px', borderRadius: '4px' }}></div>
          {[1,2,3].map(i => <div key={i} className="skeleton movement-card" style={{ height: '80px', marginBottom: '16px' }}></div>)}
        </div>
      </main>
    );
  }

  // EMPTY STATE
  if (!briefing) {
    return (
      <main style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📊</div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '32px', color: 'var(--text)', marginBottom: '8px' }}>
          {displayMonthStr} Briefing
        </h1>
        <p style={{ color: 'var(--text2)', maxWidth: '440px', textAlign: 'center', lineHeight: 1.6, marginBottom: '24px' }}>
          No briefing has been generated yet. We&apos;ll analyze your recent connections against your network to surface hidden opportunities, movements, and priority follow-ups.
        </p>
        <button onClick={handleGenerate} className="btn primary" style={{ padding: '12px 24px', fontSize: '15px' }}>
          Generate your first briefing
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', paddingBottom: '100px' }}>
      
      {/* HEADER */}
      <div style={{ textAlign: 'center', padding: '32px 0 24px', borderBottom: '1px solid var(--border)', marginBottom: '32px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Daymaker Connect</div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '32px', color: 'var(--text)', margin: '0 0 8px 0' }}>Monthly Network Intelligence Briefing</h1>
        <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
          {displayMonthStr} &middot; Generated {new Date(briefing.generatedAt?.seconds * 1000).toLocaleDateString()}
        </div>
        
        <div style={{ fontSize: '14px', color: 'var(--text2)', marginTop: '24px', textAlign: 'left', maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7, paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          {briefing.introNarrative}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <button onClick={handleGenerate} className="btn" style={{ fontSize: '12px' }}>
          ↻ Regenerate Briefing
        </button>
      </div>

      {/* SECTION 01: VITAL SIGNS */}
      <div className="briefing-section" style={{ marginBottom: '48px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Section 01</div>
        <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '24px', color: 'var(--text)', margin: '0 0 24px 0' }}>Network Vital Signs</h2>
        
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div className="stat-card" style={{ background: 'var(--surface-color)', padding: '20px', borderRadius: '8px', border: '1px solid var(--orange)' }}>
            <div style={{ fontSize: '32px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--orange)', marginBottom: '4px' }}>{briefing.newConnections}</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '2px' }}>New connections</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
              {briefing.currentWindowLabel || 'current period'}
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', background: briefing.networkGrowthPercent >= 0 ? 'rgba(39, 174, 96, 0.15)' : 'rgba(235, 87, 87, 0.15)', color: briefing.networkGrowthPercent >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {briefing.networkGrowthPercent >= 0 ? '↑' : '↓'} {Math.abs(briefing.networkGrowthPercent)}% vs {briefing.previousWindowLabel || 'prev'}
              </span>
            </div>
          </div>
          <div className="stat-card" style={{ background: 'var(--surface-color)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '32px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)', marginBottom: '4px' }}>{briefing.totalNetwork.toLocaleString()}</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Total network</div>
          </div>
          <div className="stat-card" style={{ background: 'var(--surface-color)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '32px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--blue)', marginBottom: '4px' }}>{Math.round(briefing.totalNetwork * 0.3)}</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Total Emails (Est)</div>
          </div>
          <div className="stat-card" style={{ background: 'var(--surface-color)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '32px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--green)', marginBottom: '4px' }}>{briefing.clusters?.length || 0}</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Detected Clusters</div>
          </div>
        </div>

        {/* SPARKLINE */}
        <div style={{ background: 'var(--surface-color)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>Connection growth, rolling 30-day windows, last 15 months</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '60px', gap: '8px' }}>
            {sparklineData.map((val, idx) => {
              const isLast = idx === sparklineData.length - 1;
              const h = Math.max((val / maxSpark) * 100, 4); 
              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ width: '100%', maxWidth: '32px', height: `${h}%`, background: isLast ? 'var(--orange)' : 'var(--border)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }}></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 02: NETWORK MOVEMENT */}
      {briefing.movements && briefing.movements.length > 0 && (
        <div className="briefing-section" style={{ marginBottom: '48px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Section 02</div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '24px', color: 'var(--text)', margin: '0 0 8px 0' }}>Network Movement</h2>
          <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '24px' }}>Title and company changes detected. Natural follow-up moments.</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {briefing.movements.map((move, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', background: 'var(--surface-color)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ flexShrink: 0, width: '40px', height: '40px', background: 'var(--darker)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  {move.movementType === 'company_change' ? '🔄' : '⬆'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px', marginBottom: '4px' }}>{move.contactName}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '8px' }}>
                    Transitioned from {move.previousValue} to <strong style={{ color: 'var(--text)' }}>{move.currentValue}</strong>.
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--orange)', fontWeight: 500 }}>→ {move.recommendation}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 03: PRIORITY FOLLOW UPS */}
      {briefing.followUps && briefing.followUps.length > 0 && (
        <div className="briefing-section" style={{ marginBottom: '48px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Section 03</div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '24px', color: 'var(--text)', margin: '0 0 8px 0' }}>Priority Follow-Ups</h2>
          <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '24px' }}>New connections most likely to create value, sorted by strategic alignment.</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {briefing.followUps.map((fu, i) => {
              const bg = fu.priority === 'high' ? 'rgba(255, 126, 51, 0.1)' : fu.priority === 'warm' ? 'rgba(242, 201, 76, 0.1)' : 'var(--darker)';
              const col = fu.priority === 'high' ? 'var(--orange)' : fu.priority === 'warm' ? '#F2C94C' : 'var(--text2)';
              
              return (
                <div key={i} style={{ background: 'var(--surface-color)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>{fu.contactName}</div>
                      <div style={{ fontSize: '13px', color: 'var(--orange)', fontWeight: 500 }}>{fu.company} &middot; {fu.position}</div>
                    </div>
                    <div style={{ background: bg, color: col, padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {fu.priority} Priority
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '16px' }}>
                    {fu.insight}
                  </div>
                  
                  <div style={{ background: 'var(--darker)', padding: '16px', borderRadius: '8px', borderLeft: '3px solid var(--orange)' }}>
                    <strong style={{ display: 'block', fontSize: '10px', color: 'var(--text2)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Suggested Opener</strong>
                    <div style={{ fontSize: '13px', color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{fu.suggestedOpener}"
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 04: CLUSTER DETECTION */}
      {briefing.clusters && briefing.clusters.length > 0 && (
        <div className="briefing-section" style={{ marginBottom: '48px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Section 04</div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '24px', color: 'var(--text)', margin: '0 0 8px 0' }}>Cluster Detection</h2>
          <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '24px' }}>Groups of connections sharing timing, industry, or company patterns.</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {briefing.clusters.map((cl, i) => (
              <div key={i} style={{ background: 'var(--surface-color)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '4px', fontSize: '15px' }}>📌 {cl.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
                  {cl.contactCount} connections &middot; {cl.industry || 'Unknown Sector'}
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {cl.contacts?.slice(0, 5).map((ct, j) => (
                    <span key={j} style={{ background: 'var(--darker)', border: '1px solid var(--border)', borderRadius: '20px', padding: '4px 10px', fontSize: '11px', color: 'var(--text2)' }}>
                      {ct.name} &middot; {ct.company}
                    </span>
                  ))}
                  {(cl.contacts?.length || 0) > 5 && (
                    <span style={{ background: 'transparent', padding: '4px 10px', fontSize: '11px', color: 'var(--text2)' }}>+{cl.contacts.length - 5} more</span>
                  )}
                </div>
                
                <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{cl.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 05: GOAL TRACKING */}
      {briefing.goals && briefing.goals.length > 0 && (
        <div className="briefing-section" style={{ marginBottom: '48px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Section 05</div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '24px', color: 'var(--text)', margin: '0 0 24px 0' }}>Goal Tracking</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {briefing.goals.map((gl, i) => (
              <div key={i}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>🎯 {gl.goal}</div>
                <div style={{ height: '6px', background: 'var(--darker)', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                  <div style={{ width: `${gl.progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--orange), #ff4d00)' }}></div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{gl.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RE-IMPORT PROMPT */}
      <div style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: '8px', padding: '32px', textAlign: 'center', marginTop: '64px' }}>
        <h3 style={{ fontSize: '18px', color: 'var(--blue)', marginBottom: '8px' }}>Stay Sharp</h3>
        <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '24px' }}>
          Your network intelligence is as fresh as your last LinkedIn export. Re-import now to detect the latest job movements and clusters.
        </p>
        <Link href="/dashboard" className="btn primary" style={{ background: 'var(--blue)' }}>Refresh LinkedIn Data</Link>
      </div>
    </main>
  );
}
