'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth } from '@/lib/firebase/config';
import { getDb } from '@/lib/firebase/config';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import type { Contact, DeepDive } from '@/lib/types';
import Link from 'next/link';
import UpgradeCard from '@/components/ui/UpgradeCard';

export default function DeepDiveNewPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const contactId = searchParams.get('contactId');

  const [targetContact, setTargetContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [limitReached, setLimitReached] = useState<{ message: string; upgradeUrl: string } | null>(null);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    async function fetchContact() {
      if (!user?.uid || !contactId) return;
      try {
        const db = getDb();
        if (!db) return;

        // Reuse an existing Deep Dive for this contact rather than silently
        // regenerating — scores drift run-to-run and users expect persistence.
        // The detail page exposes an explicit "Regenerate Analysis" button.
        const existingQ = query(
          collection(db, 'users', user.uid, 'deepdives'),
          where('targetContactId', '==', contactId),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        try {
          const existingSnap = await getDocs(existingQ);
          if (!existingSnap.empty) {
            const existing = existingSnap.docs[0].data() as DeepDive;
            router.replace(`/deepdive/${existing.deepdiveId}`);
            return;
          }
        } catch (indexErr) {
          // Composite index may not be created yet; fall back to no-filter scan.
          console.warn('Falling back to client-side deepdive lookup:', indexErr);
          const allSnap = await getDocs(collection(db, 'users', user.uid, 'deepdives'));
          const matches = allSnap.docs
            .map(d => d.data() as DeepDive)
            .filter(d => d.targetContactId === contactId)
            .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
          if (matches.length > 0) {
            router.replace(`/deepdive/${matches[0].deepdiveId}`);
            return;
          }
        }

        const ref = doc(db, 'users', user.uid, 'contacts', contactId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setTargetContact(snap.data() as Contact);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchContact();
  }, [user, contactId, router]);

  const handleGenerate = async () => {
    if (!targetContact || !user?.uid) return;
    setIsGenerating(true);
    setLimitReached(null);
    setGenError('');
    try {
      const token = await getAuth()?.currentUser?.getIdToken();
      const res = await fetch('/api/deepdive/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: user.uid, targetContactId: targetContact.contactId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'limit_reached') {
          setLimitReached({
            message: data.message || "You've used your free Deep Dive this month. Upgrade to Pro for unlimited Deep Dives.",
            upgradeUrl: data.upgradeUrl || '/settings',
          });
          setIsGenerating(false);
          return;
        }
        throw new Error(data.error || `Generation failed (HTTP ${res.status})`);
      }

      // Redirect to the newly generated Deep Dive
      router.push(`/deepdive/${data.deepdiveId}`);
    } catch (err: any) {
      console.error(err);
      setGenError(err.message || 'Generation failed.');
      setIsGenerating(false);
    }
  };

  if (loading) {
    return <main style={{ padding: '32px' }}><div style={{ color: 'var(--text2)' }}>Locating contact...</div></main>;
  }

  if (!targetContact) {
    return (
      <main style={{ padding: '32px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--text)' }}>Contact Not Found</h2>
        <Link href="/deepdive" className="btn primary" style={{ marginTop: '16px' }}>Back to Deep Dives</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ fontSize: '13px', color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '24px' }}>
        Deep Dive Analysis
      </div>
      
      <div className="card" style={{ padding: '32px', width: '100%', maxWidth: '500px', border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--orange-dim)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 600, margin: '0 auto 16px' }}>
          {targetContact.firstName?.[0] || '?'}{targetContact.lastName?.[0] || ''}
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '28px', color: 'var(--text)', marginBottom: '4px' }}>
          {targetContact.fullName}
        </h1>
        <div style={{ fontSize: '15px', color: 'var(--text2)', marginBottom: '8px' }}>
          {targetContact.position || 'Unknown Position'}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--orange)', fontWeight: 600, marginBottom: '32px' }}>
          {targetContact.company || 'Unknown Company'}
        </div>

        {limitReached ? (
          <UpgradeCard message={limitReached.message} upgradeUrl={limitReached.upgradeUrl} />
        ) : isGenerating ? (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{
              width: '24px', height: '24px', border: '3px solid var(--dark)',
              borderTop: '3px solid var(--orange)', borderRadius: '50%',
              animation: 'spin 1s linear infinite', margin: '0 auto 16px'
            }}></div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '14px', color: 'var(--text)' }}>Generating alignment analysis...</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '8px' }}>This may take 15-30 seconds. Do not close this page.</div>
          </div>
        ) : (
          <>
            {genError && (
              <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '13px' }}>
                {genError}
              </div>
            )}
            <button onClick={handleGenerate} className="btn primary" style={{ width: '100%', padding: '16px', fontSize: '15px' }}>
              Begin Alignment Analysis
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: '24px' }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            color: 'var(--muted)',
            fontSize: '13px',
            textDecoration: 'none',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ← Cancel
        </button>
      </div>
    </main>
  );
}
