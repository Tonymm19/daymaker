'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getDb } from '@/lib/firebase/config';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import type { DeepDive, Contact } from '@/lib/types';
import Link from 'next/link';
import { useContacts } from '@/lib/hooks/useContacts';

export default function DeepDiveIndex() {
  const { user } = useAuth();
  const { contacts, isLoading: contactsLoading } = useContacts();
  const [pastDeepDives, setPastDeepDives] = useState<DeepDive[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Search dropdown state
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Fetch History
  useEffect(() => {
    async function fetchDeepDives() {
      if (!user?.uid) return;
      try {
        const db = getDb();
        if (!db) return;
        const q = query(
          collection(db, 'users', user.uid, 'deepdives'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const results: DeepDive[] = [];
        snap.forEach(doc => results.push(doc.data() as DeepDive));
        setPastDeepDives(results);
      } catch (err) {
        console.error('Failed to load past deep dives', err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchDeepDives();
  }, [user]);

  // Collapse history to one entry per targetContactId — the server always keeps
  // the full chain (Regenerate Analysis creates new docs), but the UI should
  // show the latest analysis per person.
  const dedupedDeepDives = useMemo(() => {
    const seen = new Set<string>();
    const out: DeepDive[] = [];
    for (const dd of pastDeepDives) {
      const key = dd.targetContactId || dd.deepdiveId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(dd);
    }
    return out;
  }, [pastDeepDives]);

  const filteredContacts = contacts.filter(c => {
    if (!searchQuery) return true;
    const lowerQ = searchQuery.toLowerCase();
    return c.fullName.toLowerCase().includes(lowerQ) || 
           (c.company && c.company.toLowerCase().includes(lowerQ));
  }).slice(0, 50); // limit dropdown size

  return (
    <main style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '36px', color: 'var(--text)', marginBottom: '8px' }}>
          Deep Dive Analysis
        </h1>
        <p style={{ color: 'var(--text2)' }}>
          Strategic synergy analysis across your shared priorities and North Star.
        </p>
      </div>

      {/* Initiation Section */}
      <div className="card" style={{ padding: '32px', marginBottom: '40px', background: 'var(--surface-color)', border: '1px solid var(--orange)' }}>
        <h3 style={{ fontSize: '18px', color: 'var(--orange)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚡</span> Start New Deep Dive
        </h3>
        <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '20px' }}>
          Select a contact from your network. We&apos;ll analyze alignment with your North Star goals and surface the strongest strategic opportunities.
        </p>
        
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search connections by name or company..."
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '15px',
              backgroundColor: 'var(--dark)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              outline: 'none'
            }}
            disabled={contactsLoading}
          />

          {isDropdownOpen && searchQuery.length > 0 && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              left: 0, 
              right: 0, 
              background: 'var(--darker)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              marginTop: '4px',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 10
            }}>
              {filteredContacts.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--text2)', textAlign: 'center' }}>No matches found in your network</div>
              ) : (
                filteredContacts.map(c => (
                  <Link 
                    key={c.contactId}
                    href={`/deepdive/new?contactId=${c.contactId}`}
                    style={{ 
                      display: 'block', 
                      padding: '12px 16px', 
                      textDecoration: 'none', 
                      borderBottom: '1px solid var(--dark)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{c.fullName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--orange)' }}>{c.company} &middot; {c.position}</div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* History Section */}
      <div>
        <h3 style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '16px' }}>Past Analyses</h3>

        {loadingHistory ? (
          <div style={{ color: 'var(--text2)' }}>Loading history...</div>
        ) : dedupedDeepDives.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔬</div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '20px', color: 'var(--text)', marginBottom: '8px' }}>
              Run your first Deep Dive analysis
            </div>
            <p style={{ color: 'var(--text2)', fontSize: '13px', maxWidth: '380px', margin: '0 auto', lineHeight: 1.6 }}>
              Pick any contact above to start a synergy analysis against your North Star.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {dedupedDeepDives.map(dd => (
              <Link 
                key={dd.deepdiveId}
                href={`/deepdive/${dd.deepdiveId}`}
                style={{ textDecoration: 'none' }}
              >
                <div className="card synergy-card-dd" style={{ padding: '20px', transition: 'transform 0.2s, border 0.2s', borderLeft: dd.synergyScore > 80 ? '4px solid var(--orange)' : '4px solid var(--blue)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{dd.targetName}</div>
                    <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '14px' }}>{dd.synergyScore}/100</div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--orange)', marginBottom: '12px' }}>{dd.targetCompany}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', gap: '12px' }}>
                    <span>{new Date((dd.createdAt as any).seconds * 1000).toLocaleDateString()}</span>
                    <span>{dd.topSynergies?.length || 0} Synergies</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Overlay to close dropdown when clicking outside */}
      {isDropdownOpen && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 5 }} 
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </main>
  );
}
