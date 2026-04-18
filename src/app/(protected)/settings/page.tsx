'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useUser } from '@/lib/hooks/useUser';
import { useContacts } from '@/lib/hooks/useContacts';
import CsvUpload from '@/components/import/CsvUpload';
import Modal from '@/components/ui/Modal';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { getAuth } from '@/lib/firebase/config';

export default function SettingsPage() {
  const { user } = useAuth();
  const { userDoc, mutate, isLoading } = useUser();
  const { contacts, isLoading: contactsLoading } = useContacts();
  const [northStarInput, setNorthStarInput] = useState('');
  const [isSavingNS, setIsSavingNS] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Hydrate input field natively upon fetch
  useEffect(() => {
    if (userDoc && !northStarInput && !isSavingNS) {
      setNorthStarInput(userDoc.northStar || '');
    }
  }, [userDoc, northStarInput, isSavingNS]);

  // Sync the user doc's contactCount with the actual subcollection count.
  // The import pipeline writes this field, but it can drift after auth-driven
  // user-doc recreation or partial imports. One-time repair on Settings load.
  const actualContactCount = contacts?.length ?? 0;
  useEffect(() => {
    if (!user?.uid || contactsLoading) return;
    if (userDoc && userDoc.contactCount !== actualContactCount) {
      const db = getDb();
      if (!db) return;
      updateDoc(doc(db, 'users', user.uid), { contactCount: actualContactCount })
        .then(() => mutate())
        .catch((err) => console.error('Failed to sync contactCount', err));
    }
  }, [user?.uid, userDoc, actualContactCount, contactsLoading, mutate]);

  const handleSaveNorthStar = async () => {
    if (!user || userDoc?.northStar === northStarInput) return;
    setIsSavingNS(true);
    try {
      const db = getDb();
      if (db) {
        await updateDoc(doc(db, 'users', user.uid), {
          northStar: northStarInput,
          updatedAt: new Date()
        });
        await mutate();
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save North Star');
    } finally {
      setIsSavingNS(false);
    }
  };

  const handleCheckout = async () => {
    setStripeLoading(true);
    setErrorMsg('');
    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      
      window.location.href = data.url;
    } catch (err: any) {
      setErrorMsg(err.message);
      setStripeLoading(false);
    }
  };

  const handlePortal = async () => {
    setStripeLoading(true);
    setErrorMsg('');
    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Portal failed');
      
      window.location.href = data.url;
    } catch (err: any) {
      setErrorMsg(err.message);
      setStripeLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="main" style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const isPro = userDoc?.plan === 'pro';
  const importDate = userDoc?.linkedInImportedAt 
    ? new Date(userDoc.linkedInImportedAt.seconds * 1000).toLocaleDateString() 
    : 'Never';

  return (
    <>
      <div className="main" style={{ paddingBottom: '64px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '32px 0 24px 0', borderBottom: '1px solid var(--border)', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', margin: 0, color: 'var(--text)' }}>Settings</h1>
        </div>

        {errorMsg && (
          <div style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
          
          {/* Profile Section */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text)' }}>Profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Display Name</label>
                <input 
                  type="text" 
                  value={user?.displayName || ''} 
                  disabled 
                  style={{ width: '100%', padding: '12px', background: 'var(--darker)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Email Address</label>
                <input 
                  type="text" 
                  value={user?.email || ''} 
                  disabled 
                  style={{ width: '100%', padding: '12px', background: 'var(--darker)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '6px' }}
                />
              </div>
            </div>
            <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>Auth details are provided by Google Identity and are read-only.</p>
          </div>

          {/* North Star Section */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>North Star Goal</h3>
              <button 
                className="btn" 
                onClick={handleSaveNorthStar}
                disabled={isSavingNS || northStarInput === userDoc?.northStar}
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                {isSavingNS ? 'Saving...' : 'Save Goal'}
              </button>
            </div>
            <textarea 
              value={northStarInput}
              onChange={(e) => setNorthStarInput(e.target.value)}
              placeholder="What are you currently trying to achieve?"
              style={{
                width: '100%', minHeight: '100px', padding: '16px', background: 'var(--darker)', 
                border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', 
                resize: 'vertical', fontFamily: 'inherit', outline: 'none'
              }}
            />
            <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              This goal anchors all AI priorities across the agent dispatch and relationship management suggestions.
            </p>
          </div>

          {/* Plan & Billing */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text)' }}>Plan & Billing</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--darker)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                  {userDoc?.plan || 'Free'} Plan
                </div>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                  {isPro ? 'Unlimited queries & full network access.' : '10 AI Queries per month limit.'}
                </div>
              </div>
              <div>
                {isPro ? (
                  <button onClick={handlePortal} disabled={stripeLoading} className="btn" style={{ background: 'var(--dark)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    {stripeLoading ? 'Loading...' : 'Manage Subscription'}
                  </button>
                ) : (
                  <button onClick={handleCheckout} disabled={stripeLoading} className="btn">
                    {stripeLoading ? 'Loading...' : 'Upgrade to Pro — $29/mo'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Data Section */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text)' }}>Data Connections</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', background: 'var(--darker)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>LinkedIn Network</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', marginTop: '4px' }}>
                  {contactsLoading ? '...' : `${actualContactCount.toLocaleString()} Contacts`}
                </div>
              </div>
              <div style={{ padding: '16px', background: 'var(--darker)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Last Import</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', marginTop: '4px' }}>
                  {importDate}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn" onClick={() => setShowUpload(true)}>Upload CSV</button>
              <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer" className="btn" style={{ background: 'var(--dark)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none' }}>
                Get New LinkedIn Data ↗
              </a>
            </div>
          </div>

          {/* Reflections Match Section */}
          <div className="card" style={{ padding: '24px', background: 'linear-gradient(145deg, var(--surface) 0%, #2a1645 100%)', border: '1px solid #4a2185' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
              </svg>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#e9d5ff' }}>Reflections Match</h3>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#c084fc', lineHeight: 1.5 }}>
              Reflections Match integration is coming in a future update. Your digital twin persona traits will personalize all AI recommendations.
            </p>
            <button
              disabled
              aria-disabled="true"
              style={{
                padding: '8px 16px',
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                borderRadius: '20px',
                color: '#d8b4fe',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                cursor: 'not-allowed',
                opacity: 0.8
              }}
            >
              Coming Soon — Phase 2
            </button>
          </div>

        </div>
      </div>

      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload LinkedIn Connections">
        <CsvUpload onComplete={() => { mutate(); setTimeout(() => setShowUpload(false), 3000); }} />
      </Modal>
    </>
  );
}
