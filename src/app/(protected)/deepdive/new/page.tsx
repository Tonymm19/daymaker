'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth } from '@/lib/firebase/config';
import { getDb } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import type { Contact } from '@/lib/types';
import Link from 'next/link';

export default function DeepDiveNewPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const contactId = searchParams.get('contactId');

  const [targetContact, setTargetContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    async function fetchContact() {
      if (!user?.uid || !contactId) return;
      try {
        const db = getDb();
        if (!db) return;
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
  }, [user, contactId]);

  const handleGenerate = async () => {
    if (!targetContact || !user?.uid) return;
    setIsGenerating(true);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Redirect to the newly generated Deep Dive
      router.push(`/deepdive/${data.deepdiveId}`);
    } catch (err: any) {
      console.error(err);
      alert('Generation Failed: ' + err.message);
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
        Initiate Agentic Deep Dive
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

        {isGenerating ? (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ 
              width: '24px', height: '24px', border: '3px solid var(--dark)', 
              borderTop: '3px solid var(--orange)', borderRadius: '50%', 
              animation: 'spin 1s linear infinite', margin: '0 auto 16px' 
            }}></div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '14px', color: 'var(--text)' }}>Running 4-Round Agent Dialogue...</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '8px' }}>This may take 15-30 seconds. Do not close this page.</div>
          </div>
        ) : (
          <button onClick={handleGenerate} className="btn primary" style={{ width: '100%', padding: '16px', fontSize: '15px' }}>
            Begin Synergy Analysis
          </button>
        )}
      </div>

      <div style={{ marginTop: '24px' }}>
        <Link href="/deepdive" style={{ color: 'var(--muted)', fontSize: '13px', textDecoration: 'none' }}>
          ← Cancel
        </Link>
      </div>
    </main>
  );
}
