'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/hooks/useUser';
import CsvUpload from '@/components/import/CsvUpload';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/AuthContext';

type Step = 'north_star' | 'upload' | 'success';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { userDoc, isLoading, mutate } = useUser();
  const [step, setStep] = useState<Step>('north_star');
  const [northStarInput, setNorthStarInput] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [contactResultCount, setContactResultCount] = useState(0);

  // Redirection guard
  useEffect(() => {
    if (!isLoading && userDoc && userDoc.contactCount > 0) {
      router.replace('/dashboard');
    }
  }, [userDoc, isLoading, router]);

  // Handle Loading/Bouncing visual guard (prevent flash of onboarding)
  if (isLoading || (userDoc && userDoc.contactCount > 0)) {
    return (
      <div className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="loading-spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
      </div>
    );
  }

  const handleSaveNorthStar = async () => {
    if (!northStarInput.trim() || !user) return;
    setSaveLoading(true);

    try {
      const db = getDb();
      if (!db) throw new Error('Database not initialized');
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        northStar: northStarInput.trim(),
        updatedAt: new Date()
      });

      await mutate(); // Refresh local user doc state
      setStep('upload');
    } catch (err) {
      console.error('Failed to save North Star:', err);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUploadComplete = (result: any) => {
    setContactResultCount(result.total || result.imported || 0);
    setStep('success');
    mutate(); // Refresh the contact count so dashboard is ready natively
  };

  return (
    <div className="main" style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ maxWidth: '600px', width: '100%', margin: '64px auto', padding: '0 24px' }}>
        {/* Progress Tracker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ flex: 1, height: '4px', background: 'var(--orange)', borderRadius: '2px' }} />
          <div style={{ flex: 1, height: '4px', background: step === 'north_star' ? 'var(--border)' : 'var(--orange)', borderRadius: '2px', transition: 'background 0.3s' }} />
          <div style={{ flex: 1, height: '4px', background: step === 'success' ? 'var(--orange)' : 'var(--border)', borderRadius: '2px', transition: 'background 0.3s' }} />
        </div>

        {step === 'north_star' && (
          <div className="card" style={{ padding: '40px 32px' }}>
            <h1 style={{ margin: '0 0 16px 0', fontSize: '28px', color: 'var(--text)' }}>Welcome to Daymaker</h1>
            <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.6, marginBottom: '32px' }}>
              The AI Agent uses your &quot;North Star&quot; goal to prioritize recommendations, parse relevance, and generate warm introductions across your network perfectly synced to you.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>What is your North Star goal?</label>
              <textarea 
                value={northStarInput}
                onChange={(e) => setNorthStarInput(e.target.value)}
                placeholder="E.g., I'm raising a $5M seed round for my B2B SaaS startup..."
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '16px',
                  background: 'var(--darker)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '15px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn" 
                onClick={handleSaveNorthStar}
                disabled={saveLoading || !northStarInput.trim()}
                style={{ padding: '12px 32px' }}
              >
                {saveLoading ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="card" style={{ padding: '40px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', color: 'var(--muted)', marginBottom: '24px' }} onClick={() => setStep('north_star')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span style={{ fontSize: '14px' }}>Back</span>
            </div>
            
            <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', color: 'var(--text)' }}>Import your network</h2>
            <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.6, marginBottom: '32px' }}>
              Upload your LinkedIn Connections export. We will strictly extract names, roles, and companies natively embedding classifications into your AI vectors.
            </p>

            <CsvUpload onComplete={handleUploadComplete} />
          </div>
        )}

        {step === 'success' && (
          <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', background: 'var(--green-dim)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' 
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            
            <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', color: 'var(--text)' }}>Pipeline Complete</h2>
            <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.6, marginBottom: '32px' }}>
              Successfully ingested, categorized, and embedded <b>{contactResultCount}</b> contacts. The AI algorithm is ready mapping connections toward your North Star natively.
            </p>

            <button className="btn" onClick={() => router.push('/dashboard')} style={{ padding: '12px 32px' }}>
              Go to Dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
