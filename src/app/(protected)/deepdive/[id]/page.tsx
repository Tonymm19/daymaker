'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth, getDb } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import type { DeepDive } from '@/lib/types';
import Link from 'next/link';

export default function DeepDiveView() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();

  const [deepDive, setDeepDive] = useState<DeepDive | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'transcript'>('summary');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');

  const handleRegenerate = async () => {
    if (!deepDive || !user?.uid) return;
    if (!confirm('Regenerate this Deep Dive? The existing analysis will be preserved in history, and a new one will be created.')) {
      return;
    }
    setIsRegenerating(true);
    setRegenError('');
    try {
      const token = await getAuth()?.currentUser?.getIdToken();
      const res = await fetch('/api/deepdive/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: user.uid, targetContactId: deepDive.targetContactId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Regeneration failed');
      router.push(`/deepdive/${data.deepdiveId}`);
    } catch (err: any) {
      setRegenError(err.message);
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      if (!user?.uid || !id) return;
      try {
        const db = getDb();
        if (!db) return;
        const ref = doc(db, 'users', user.uid, 'deepdives', id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setDeepDive(snap.data() as DeepDive);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, id]);

  if (loading) {
    return <main style={{ padding: '32px' }}><div style={{ color: 'var(--text2)' }}>Loading Deep Dive...</div></main>;
  }

  if (!deepDive) {
    return <main style={{ padding: '32px' }}><div style={{ color: 'var(--red)' }}>Deep Dive not found.</div></main>;
  }

  const generatedDate = new Date((deepDive.createdAt as any).seconds * 1000).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  const userActions = deepDive.actionItems?.filter(a => a.forParty === 'user') || [];
  const targetActions = deepDive.actionItems?.filter(a => a.forParty === 'target') || [];

  return (
    <main style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', paddingBottom: '100px' }}>
      
      {/* Top Breadcrumb */}
      <div style={{ marginBottom: '24px' }}>
        <Link href="/deepdive" style={{ color: 'var(--muted)', fontSize: '13px', textDecoration: 'none' }}>
          ← Back to Deep Dives
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }}></div>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)', letterSpacing: '1px', textTransform: 'uppercase' }}>Deep Dive Complete</span>
      </div>
      
      <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '36px', color: 'var(--text)', marginBottom: '8px' }}>
        {user?.displayName || 'User'} × {deepDive.targetName}
      </div>
      <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '32px' }}>
        Network Synergy Analysis · {generatedDate}
      </div>

      {/* Score Bar */}
      <div className="card" style={{ 
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', 
        padding: '24px 32px', background: 'var(--surface-color)', border: '1px solid var(--border)', marginBottom: '32px' 
      }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Synergy Score</div>
          <div style={{ fontSize: '48px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--orange)', fontWeight: 300, lineHeight: 1 }}>
            {deepDive.synergyScore}<span style={{ fontSize: '24px', color: 'var(--muted)' }}>/100</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '48px', textAlign: 'center' }}>
          <div title="Contacts in your imported LinkedIn network who work at the same company as the target. Not actual LinkedIn mutual connections.">
            <div style={{ fontSize: '24px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)', marginBottom: '4px' }}>{deepDive.mutualConnections}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contacts at<br/>Similar Companies</div>
          </div>
          <div title="Companies that appear in both the target's profile and your imported network.">
            <div style={{ fontSize: '24px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)', marginBottom: '4px' }}>{deepDive.sharedCompanies?.length || 0}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Network<br/>Overlap</div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)', marginBottom: '4px' }}>{deepDive.topSynergies?.length || 0}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Key<br/>Synergies</div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '-20px', marginBottom: '32px', fontStyle: 'italic' }}>
        Based on imported LinkedIn data. For full mutual connection data, check LinkedIn directly.
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button 
          onClick={() => setViewMode('summary')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: '20px',
            border: '1px solid var(--border)',
            background: viewMode === 'summary' ? 'var(--orange-dim)' : 'transparent',
            color: viewMode === 'summary' ? 'var(--orange)' : 'var(--text2)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Summary
        </button>
        <button 
          onClick={() => setViewMode('transcript')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: '20px',
            border: '1px solid var(--border)',
            background: viewMode === 'transcript' ? 'var(--orange-dim)' : 'transparent',
            color: viewMode === 'transcript' ? 'var(--orange)' : 'var(--text2)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Full Transcript
        </button>
      </div>

      {/* SUMMARY VIEW */}
      {viewMode === 'summary' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div className="card" style={{ padding: '32px', background: 'var(--surface-color)', border: '1px solid var(--border)', marginBottom: '32px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Executive Summary</div>
            <p style={{ color: 'var(--text2)', lineHeight: 1.7, fontSize: '15px' }}>
              {deepDive.executiveSummary}
            </p>
          </div>

          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', marginTop: '32px' }}>Top Synergies</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {deepDive.topSynergies?.map((syn, i) => (
              <div key={i} className="card" style={{ 
                padding: '24px', 
                background: 'var(--surface-color)', 
                border: '1px solid var(--border)',
                borderLeft: syn.strength === 'high' ? '4px solid var(--orange)' : syn.strength === 'medium' ? '4px solid var(--blue)' : '4px solid var(--border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  <strong style={{ color: 'var(--text)', fontSize: '16px' }}>{i + 1}. {syn.area}</strong>
                  <span style={{ 
                    padding: '4px 10px', 
                    borderRadius: '12px', 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    textTransform: 'uppercase',
                    background: syn.strength === 'high' ? 'var(--orange-dim)' : 'var(--blue-dim)',
                    color: syn.strength === 'high' ? 'var(--orange)' : 'var(--blue)'
                  }}>
                    {syn.strength} Priority
                  </span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                  <div style={{ background: 'var(--darker)', padding: '16px', borderRadius: '8px' }}>
                    <div className="user-agent" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>For {user?.displayName || 'You'}</div>
                    <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{syn.valueForUser}</p>
                  </div>
                  <div style={{ background: 'var(--darker)', padding: '16px', borderRadius: '8px' }}>
                    <div className="target-agent" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>For {deepDive.targetName}</div>
                    <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{syn.valueForTarget}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', marginTop: '32px' }}>Recommended Next Steps</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
            <div className="card" style={{ padding: '24px', background: 'var(--surface-color)', border: '1px solid var(--blue)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--blue)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>Your Actions</div>
              {userActions.map((act, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--dark)' }}>
                  <span className="user-agent" style={{ color: 'var(--blue)', fontWeight: 600 }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.5 }}>{act.action}</span>
                </div>
              ))}
            </div>
            
            <div className="card" style={{ padding: '24px', background: 'var(--surface-color)', border: '1px solid var(--orange)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--orange)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>{deepDive.targetName.toUpperCase()}'S ACTIONS</div>
              {targetActions.map((act, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--dark)' }}>
                  <span className="target-agent" style={{ color: 'var(--orange)', fontWeight: 600 }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.5 }}>{act.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TRANSCRIPT VIEW */}
      {viewMode === 'transcript' && (
        <div style={{ padding: '24px', background: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--border)', animation: 'fadeIn 0.3s' }}>
          {deepDive.rounds?.map((round, i) => (
            <div key={i} style={{ marginBottom: '40px' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <span style={{ background: 'var(--darker)', padding: '6px 16px', borderRadius: '16px', fontSize: '12px', color: 'var(--text2)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Round {round.roundNumber}: {round.title}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* User Agent Message */}
                <div style={{ display: 'flex', gap: '16px', maxWidth: '85%' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--blue-dim)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
                    {user?.displayName?.[0] || 'U'}
                  </div>
                  <div style={{ background: 'var(--darker)', padding: '16px 20px', borderRadius: '12px 12px 12px 0', border: '1px solid var(--border)', position: 'relative' }}>
                    <div style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>User Agent</div>
                    <div style={{ color: 'var(--text)', fontSize: '14.5px', lineHeight: 1.6 }}>{round.userAgentMessage}</div>
                  </div>
                </div>

                {/* Target Agent Message */}
                <div style={{ display: 'flex', gap: '16px', maxWidth: '85%', alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--orange-dim)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
                    {deepDive.targetName[0]}
                  </div>
                  <div style={{ background: 'rgba(255, 126, 51, 0.05)', padding: '16px 20px', borderRadius: '12px 12px 0 12px', border: '1px solid rgba(255,126,51,0.2)', position: 'relative' }}>
                    <div style={{ fontSize: '11px', color: 'var(--orange)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', textAlign: 'right' }}>Target Agent ({deepDive.targetName})</div>
                    <div style={{ color: 'var(--text)', fontSize: '14.5px', lineHeight: 1.6 }}>{round.targetAgentMessage}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Actions */}
      {regenError && (
        <div style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '12px', borderRadius: '8px', marginTop: '24px' }}>
          {regenError}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '40px', flexWrap: 'wrap' }}>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="btn"
          style={{ background: 'var(--darker)', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 24px' }}
        >
          {isRegenerating ? 'Regenerating...' : 'Regenerate Analysis'}
        </button>
        <button className="btn" style={{ background: 'var(--darker)', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 24px' }}>Share Results</button>
        <button className="btn primary" style={{ padding: '12px 24px' }}>Schedule Follow-Up</button>
      </div>

    </main>
  );
}
