'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { Contact } from '@/lib/types';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth } from '@/lib/firebase/config';
import Link from 'next/link';

interface ContactDetailModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  northStar: string;
  /** Called after starters are generated + saved. Parent uses this to update
   *  its contacts cache so subsequent opens show the saved starters instantly. */
  onStartersUpdated?: (contactId: string, starters: string[]) => void;
}

export default function ContactDetailModal({ contact, isOpen, onClose, northStar, onStartersUpdated }: ContactDetailModalProps) {
  const { user } = useAuth();
  // Starters freshly generated in this session (overrides any saved ones on
  // the contact document for the current modal view).
  const [freshStarters, setFreshStarters] = useState<string[]>([]);
  const [loadingStarters, setLoadingStarters] = useState(false);
  const [startersError, setStartersError] = useState('');

  const [draft, setDraft] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);

  // Starters to display: freshly generated this session win; otherwise fall
  // back to the persisted array on the contact document.
  const displayStarters: string[] =
    freshStarters.length > 0 ? freshStarters : (contact?.conversationStarters ?? []);

  // Reset transient state when a new contact is opened. Starters are NOT
  // auto-fetched — if the contact has persisted starters, displayStarters
  // picks them up; otherwise the user opts in via the Generate button.
  useEffect(() => {
    if (isOpen && contact) {
      setFreshStarters([]);
      setStartersError('');
      setDraft('');
      setIsDrafting(false);
    }
  }, [isOpen, contact?.contactId]);

  const handleGenerateStarters = async () => {
    if (!contact || !user) return;
    setLoadingStarters(true);
    setStartersError('');
    try {
      const token = await getAuth()?.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/ai/conversation-starters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          contactId: contact.contactId,
          contactName: contact.fullName,
          company: contact.company,
          position: contact.position,
          northStar
        })
      });

      const data = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) {
        throw new Error(data.error || `Failed (HTTP ${res.status})`);
      }

      const fetched: string[] = Array.isArray(data.starters) ? data.starters : [];
      if (fetched.length === 0) {
        throw new Error('No starters returned');
      }
      setFreshStarters(fetched);
      onStartersUpdated?.(contact.contactId, fetched);
    } catch (err) {
      console.error('Failed to generate conversation starters:', err);
      setStartersError(err instanceof Error ? err.message : 'Failed to generate starters');
    } finally {
      setLoadingStarters(false);
    }
  };

  const handleDraftMessage = async () => {
    if (!contact || !user) return;
    setIsDrafting(true);
    setLoadingDraft(true);
    try {
      const token = await getAuth()?.currentUser?.getIdToken();
      const res = await fetch('/api/ai/draft-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          contactName: contact.fullName,
          company: contact.company,
          position: contact.position,
          northStar
        })
      });

      if (res.ok) {
        const data = await res.json();
        setDraft(data.draft || '');
      }
    } catch (err) {
      console.error("Failed to draft message:", err);
    } finally {
      setLoadingDraft(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft);
  };

  if (!contact) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contact Details">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Profile Section */}
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: '32px', margin: '0 0 8px 0', color: 'var(--text)' }}>
            {contact.fullName}
          </h2>
          {contact.position && <div style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '4px' }}>{contact.position}</div>}
          {contact.company && <div style={{ fontSize: '16px', color: 'var(--orange)', fontWeight: 600, marginBottom: '12px' }}>{contact.company}</div>}
          
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px', flexWrap: 'wrap' }}>
            {contact.email && (
              <a href={`mailto:${contact.email}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                ✉️ {contact.email}
              </a>
            )}
            {contact.linkedInUrl && (
              <a href={contact.linkedInUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                🔗 LinkedIn Profile
              </a>
            )}
          </div>
        </div>

        {/* Categories */}
        {contact.categories && contact.categories.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {contact.categories.map((cat, i) => (
              <span key={i} style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                color: 'var(--muted)'
              }}>
                {cat}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Connected: {contact.connectedOn ? typeof contact.connectedOn.toDate === 'function' ? contact.connectedOn.toDate().toLocaleDateString() : new Date(contact.connectedOn as any).toLocaleDateString() : 'Unknown'}
        </div>

        {/* Conversation Starters (Claude) — opt-in via button to control API cost */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid var(--orange)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', margin: 0, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              AI Conversation Starters ✨
            </h3>
            {displayStarters.length > 0 && !loadingStarters && (
              <button
                type="button"
                onClick={handleGenerateStarters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--orange)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  letterSpacing: '0.3px',
                  textTransform: 'uppercase',
                }}
              >
                Regenerate ✨
              </button>
            )}
          </div>

          {displayStarters.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {displayStarters.map((starter, i) => (
                <div
                  key={i}
                  className="starter"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    background: 'var(--surface2)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    className="starter-num"
                    style={{
                      flexShrink: 0,
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'var(--orange-dim)',
                      color: 'var(--orange)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    className="starter-text"
                    style={{
                      flex: 1,
                      fontSize: '14px',
                      color: 'var(--text)',
                      lineHeight: 1.55,
                    }}
                  >
                    {starter}
                  </div>
                </div>
              ))}
            </div>
          ) : loadingStarters ? (
            <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Generating personalized openers...</div>
          ) : startersError ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: 'var(--red)', fontSize: '13px' }}>⚠ {startersError}</div>
              <button
                type="button"
                onClick={handleGenerateStarters}
                className="btn btn-secondary"
                style={{ alignSelf: 'flex-start' }}
              >
                Try again
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerateStarters}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
            >
              Generate Conversation Starters ✨
            </button>
          )}
        </div>

        {/* Drafting UI */}
        {isDrafting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '14px', margin: 0, color: 'var(--text)' }}>Message Draft</h3>
            {loadingDraft ? (
               <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Drafting message...</div>
            ) : (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <button 
                  onClick={copyToClipboard}
                  className="btn btn-secondary" 
                  style={{ alignSelf: 'flex-start' }}
                >
                  Copy to Clipboard 📋
                </button>
              </>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Link href={`/deepdive/new?contactId=${contact.contactId}`} className="btn btn-primary" style={{ textDecoration: 'none', flex: 1, textAlign: 'center', boxSizing: 'border-box' }}>
            Deep Dive Analysis ⚡
          </Link>
          {!isDrafting && (
            <button className="btn btn-secondary" style={{ flex: 1, boxSizing: 'border-box' }} onClick={handleDraftMessage}>
              Draft Message ✍️
            </button>
          )}
        </div>

      </div>
    </Modal>
  );
}
