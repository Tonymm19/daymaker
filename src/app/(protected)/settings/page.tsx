'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useUser } from '@/lib/hooks/useUser';
import { useContacts } from '@/lib/hooks/useContacts';
import CsvUpload from '@/components/import/CsvUpload';
import Modal from '@/components/ui/Modal';
import Avatar from '@/components/ui/Avatar';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { getAuth } from '@/lib/firebase/config';
import { signOut } from 'firebase/auth';
import type { DaymakerUser, RmActiveTheme, RmExpertiseArea } from '@/lib/types';
import { FREE_QUERY_LIMIT, FREE_DEEPDIVE_LIMIT } from '@/lib/constants';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB
const PHOTO_TARGET_PX = 200;
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function resizeImageToDataUrl(file: File, size: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image'));
    el.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Center-crop cover so the square fills without distortion.
  const scale = Math.max(size / img.width, size / img.height);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { userDoc, mutate, isLoading } = useUser();
  const { contacts, isLoading: contactsLoading } = useContacts();
  const [northStarInput, setNorthStarInput] = useState('');
  const [isSavingNS, setIsSavingNS] = useState(false);
  const [currentGoalInput, setCurrentGoalInput] = useState('');
  const [connectionTypeInput, setConnectionTypeInput] = useState('');
  const [isSavingCG, setIsSavingCG] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [hiddenBusy, setHiddenBusy] = useState<string | null>(null);

  // Onboarding answers
  const [ninetyDayGoalInput, setNinetyDayGoalInput] = useState('');
  const [successfulConnectionInput, setSuccessfulConnectionInput] = useState('');
  const [isSavingAnswers, setIsSavingAnswers] = useState(false);
  const [answersSaved, setAnswersSaved] = useState(false);

  // Account deletion
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file
    if (!file || !user) return;

    setPhotoError('');
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Use a .jpg, .png, or .webp image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Image must be 2MB or smaller.');
      return;
    }

    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, PHOTO_TARGET_PX);
      const db = getDb();
      if (!db) throw new Error('Database not initialized');
      await updateDoc(doc(db, 'users', user.uid), {
        profilePhotoUrl: dataUrl,
        updatedAt: new Date(),
      });
      await mutate();
    } catch (err: any) {
      setPhotoError(err?.message || 'Could not upload photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      const db = getDb();
      if (!db) throw new Error('Database not initialized');
      await updateDoc(doc(db, 'users', user.uid), {
        profilePhotoUrl: deleteField(),
        updatedAt: new Date(),
      });
      await mutate();
    } catch (err: any) {
      setPhotoError(err?.message || 'Could not remove photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  // Hydrate input field natively upon fetch
  useEffect(() => {
    if (userDoc && !northStarInput && !isSavingNS) {
      setNorthStarInput(userDoc.northStar || '');
    }
  }, [userDoc, northStarInput, isSavingNS]);

  // Hydrate current goal + connection type on first load.
  const currentGoalHydrated = useRef(false);
  useEffect(() => {
    if (!userDoc || currentGoalHydrated.current) return;
    currentGoalHydrated.current = true;
    setCurrentGoalInput(userDoc.currentGoal || '');
    setConnectionTypeInput(userDoc.connectionType || '');
  }, [userDoc]);

  // Hydrate onboarding answers once.
  const answersHydrated = useRef(false);
  useEffect(() => {
    if (!userDoc || answersHydrated.current) return;
    answersHydrated.current = true;
    setNinetyDayGoalInput(userDoc.onboardingAnswers?.ninetyDayGoal || '');
    setSuccessfulConnectionInput(userDoc.onboardingAnswers?.successfulConnection || '');
  }, [userDoc]);

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

  const currentGoalDirty =
    (userDoc?.currentGoal || '') !== currentGoalInput ||
    (userDoc?.connectionType || '') !== connectionTypeInput;

  const handleSaveCurrentGoal = async () => {
    if (!user || !currentGoalDirty) return;
    setIsSavingCG(true);
    try {
      const db = getDb();
      if (db) {
        await updateDoc(doc(db, 'users', user.uid), {
          currentGoal: currentGoalInput,
          connectionType: connectionTypeInput,
          updatedAt: new Date(),
        });
        await mutate();
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save Current Goal');
    } finally {
      setIsSavingCG(false);
    }
  };

  const answersDirty =
    (userDoc?.onboardingAnswers?.ninetyDayGoal || '') !== ninetyDayGoalInput ||
    (userDoc?.onboardingAnswers?.successfulConnection || '') !== successfulConnectionInput;

  const handleSaveAnswers = async () => {
    if (!user || !answersDirty) return;
    setIsSavingAnswers(true);
    setAnswersSaved(false);
    try {
      const db = getDb();
      if (db) {
        await updateDoc(doc(db, 'users', user.uid), {
          onboardingAnswers: {
            ninetyDayGoal: ninetyDayGoalInput.trim(),
            successfulConnection: successfulConnectionInput.trim(),
          },
          updatedAt: new Date(),
        });
        await mutate();
        setAnswersSaved(true);
        setTimeout(() => setAnswersSaved(false), 2500);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save answers');
    } finally {
      setIsSavingAnswers(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleteError('');
    setIsDeleting(true);
    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Deletion failed (HTTP ${res.status})`);
      // Sign the user out client-side, then bounce to the landing page.
      try { if (auth) await signOut(auth); } catch { /* ignore */ }
      router.replace('/');
    } catch (err: any) {
      setDeleteError(err.message || 'Could not delete your account.');
      setIsDeleting(false);
    }
  };

  const handleUnhideContact = async (contactId: string) => {
    if (!user) return;
    setHiddenBusy(contactId);
    try {
      const db = getDb();
      if (!db) throw new Error('Database not initialized');
      const next = (userDoc?.hiddenContacts || []).filter((id) => id !== contactId);
      await updateDoc(doc(db, 'users', user.uid), {
        hiddenContacts: next,
        updatedAt: new Date(),
      });
      await mutate();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to unhide contact');
    } finally {
      setHiddenBusy(null);
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
          <h1 style={{ fontSize: '28px', margin: 0, color: 'var(--text)' }}>Profile</h1>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
              <Avatar
                photoUrl={userDoc?.profilePhotoUrl}
                name={user?.displayName}
                email={user?.email}
                size={72}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                  >
                    {photoBusy ? 'Uploading...' : userDoc?.profilePhotoUrl ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {userDoc?.profilePhotoUrl && !photoBusy && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  JPG, PNG, or WebP. Max 2MB. Resized to 200×200.
                </p>
                {photoError && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--red)' }}>{photoError}</p>
                )}
              </div>
            </div>

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

          {/* Current Goal Section */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>Current Goal</h3>
              <button
                className="btn"
                onClick={handleSaveCurrentGoal}
                disabled={isSavingCG || !currentGoalDirty}
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                {isSavingCG ? 'Saving...' : 'Save Goal'}
              </button>
            </div>
            <textarea
              value={currentGoalInput}
              onChange={(e) => setCurrentGoalInput(e.target.value)}
              placeholder="What are you working toward right now that the right introduction could accelerate?"
              style={{
                width: '100%', minHeight: '100px', padding: '16px', background: 'var(--darker)',
                border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px',
                resize: 'vertical', fontFamily: 'inherit', outline: 'none',
              }}
            />

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '10px' }}>
                What kind of connection would help most?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { value: 'cofounder', label: 'A co-founder' },
                  { value: 'client', label: 'A client' },
                  { value: 'investor', label: 'An investor' },
                  { value: 'collaborator', label: 'A collaborator' },
                  { value: 'mentor', label: 'A mentor' },
                  { value: 'other', label: 'Something else' },
                ].map((opt) => {
                  const active = connectionTypeInput === opt.value;
                  return (
                    <label
                      key={opt.value}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                        background: active ? 'var(--orange-dim)' : 'transparent',
                        color: active ? 'var(--orange)' : 'var(--text2)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="connectionType"
                        value={opt.value}
                        checked={active}
                        onChange={() => setConnectionTypeInput(opt.value)}
                        style={{ margin: 0 }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <p style={{ margin: '16px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              Used alongside your North Star to personalize query results, deep dives, conversation starters, and event briefings.
            </p>
          </div>

          {/* Help Us Know You Better */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>Help Us Know You Better</h3>
              {answersSaved && (
                <span style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>Saved ✓</span>
              )}
            </div>
            <p style={{ margin: '4px 0 20px 0', fontSize: '13px', color: 'var(--muted)' }}>
              Short answers that make every AI recommendation feel more like you.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '8px' }}>
                  What&apos;s the one thing you&apos;re trying to make happen in the next 90 days, and who would need to be in the room for it to move?
                </label>
                <textarea
                  value={ninetyDayGoalInput}
                  onChange={(e) => setNinetyDayGoalInput(e.target.value)}
                  rows={2}
                  placeholder="e.g. Close our seed round — need 2 more lead-investor introductions in fintech."
                  style={{
                    width: '100%', padding: '12px', background: 'var(--darker)',
                    border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px',
                    resize: 'vertical', fontFamily: 'inherit', outline: 'none', fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '8px' }}>
                  What does a successful connection look like for you this month?
                </label>
                <textarea
                  value={successfulConnectionInput}
                  onChange={(e) => setSuccessfulConnectionInput(e.target.value)}
                  rows={2}
                  placeholder="e.g. A 20-minute call with a founder who has shipped a B2B product to Fortune-500 procurement."
                  style={{
                    width: '100%', padding: '12px', background: 'var(--darker)',
                    border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px',
                    resize: 'vertical', fontFamily: 'inherit', outline: 'none', fontSize: '14px',
                  }}
                />
              </div>

              <button
                className="btn"
                onClick={handleSaveAnswers}
                disabled={isSavingAnswers || !answersDirty}
                style={{ padding: '8px 16px', fontSize: '13px', alignSelf: 'flex-start' }}
              >
                {isSavingAnswers ? 'Saving...' : 'Save Answers'}
              </button>
            </div>
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
                  {isPro ? 'Unlimited queries, Deep Dives, and event briefings.' : '3 AI queries, 1 Deep Dive, 0 event briefings per month.'}
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

          {/* Usage This Month */}
          <UsageThisMonthCard userDoc={userDoc} />

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
                Refresh LinkedIn Data ↗
              </a>
            </div>
          </div>

          <ReflectionsMatchCard userDoc={userDoc} onUpdated={mutate} />

          {/* Hidden Contacts */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text)' }}>Hidden Contacts</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--muted)' }}>
              Contacts you&apos;ve hidden from search, categories, companies, AI queries, and event briefings.
            </p>
            {(() => {
              const hiddenIds = userDoc?.hiddenContacts || [];
              if (hiddenIds.length === 0) {
                return (
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                    You haven&apos;t hidden anyone. Use the hide icon on a contact card to filter them out of all views.
                  </div>
                );
              }
              const byId = new Map(contacts.map((c) => [c.contactId, c]));
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {hiddenIds.map((cid) => {
                    const c = byId.get(cid);
                    return (
                      <div
                        key={cid}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          background: 'var(--darker)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600 }}>
                            {c?.fullName || 'Unknown contact'}
                          </div>
                          {c && (
                            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                              {c.position || 'No title'}
                              {c.company ? ` · ${c.company}` : ''}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnhideContact(cid)}
                          disabled={hiddenBusy === cid}
                          className="btn"
                          style={{ padding: '6px 14px', fontSize: '12px', background: 'var(--dark)', color: 'var(--text)', border: '1px solid var(--border)' }}
                        >
                          {hiddenBusy === cid ? 'Unhiding...' : 'Unhide'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Danger Zone — Delete Account */}
          <div
            className="card"
            style={{
              padding: '24px',
              border: '1px solid var(--red)',
              background: 'rgba(239, 68, 68, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--red)' }}>Delete My Account</h3>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
              Permanently deletes your account and everything tied to it — contacts, Deep Dives,
              event briefings, and saved settings. This cannot be undone.
            </p>
            <button
              onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(''); }}
              className="btn"
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                background: 'transparent',
                color: 'var(--red)',
                border: '1px solid var(--red)',
                fontWeight: 600,
              }}
            >
              Delete My Account
            </button>
          </div>

        </div>
      </div>

      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload LinkedIn Connections">
        <CsvUpload onComplete={() => { mutate(); setTimeout(() => setShowUpload(false), 3000); }} />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => { if (!isDeleting) setShowDeleteModal(false); }}
        title="Delete your account?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text)', lineHeight: 1.6 }}>
            This will permanently delete your account and all associated data including contacts,
            Deep Dives, event briefings, and saved settings. This action cannot be undone.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>
              Type <strong style={{ color: 'var(--red)', fontFamily: "'JetBrains Mono', monospace" }}>DELETE</strong> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={isDeleting}
              autoFocus
              style={{
                width: '100%', padding: '12px', background: 'var(--darker)',
                border: `1px solid ${deleteConfirmText === 'DELETE' ? 'var(--red)' : 'var(--border)'}`,
                color: 'var(--text)', borderRadius: '6px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          {deleteError && (
            <div style={{ padding: '10px 14px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '13px' }}>
              {deleteError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
              className="btn"
              style={{ padding: '8px 16px', fontSize: '13px', background: 'var(--dark)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || isDeleting}
              className="btn"
              style={{
                padding: '8px 16px', fontSize: '13px', background: 'var(--red)', color: '#fff',
                border: '1px solid var(--red)', fontWeight: 600,
                opacity: (deleteConfirmText !== 'DELETE' || isDeleting) ? 0.5 : 1,
                cursor: (deleteConfirmText !== 'DELETE' || isDeleting) ? 'not-allowed' : 'pointer',
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete My Account'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ============================================================================
// Usage This Month card
// ============================================================================

function UsageThisMonthCard({ userDoc }: { userDoc: DaymakerUser | null | undefined }) {
  if (!userDoc) return null;
  const isPro = userDoc.plan === 'pro';

  // Month rollover is written on each usage event, but if the user hasn't
  // triggered anything yet this calendar month their counters still point at
  // last month. Clamp displayed counts to zero in that case.
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const sameMonth = userDoc.currentMonthString === currentMonthStr;
  const queries = sameMonth ? (userDoc.currentMonthQueries || 0) : 0;
  const deepDives = sameMonth ? (userDoc.currentMonthDeepDives || 0) : 0;
  const events = sameMonth ? (userDoc.currentMonthEvents || 0) : 0;

  const Row = ({ label, body, highlight }: { label: string; body: React.ReactNode; highlight?: boolean }) => (
    <div style={{
      padding: '14px 16px',
      background: 'var(--darker)',
      border: `1px solid ${highlight ? 'var(--orange)' : 'var(--border)'}`,
      borderRadius: '8px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{label}</div>
      <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
        {body}
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>Usage This Month</h3>
        <span style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: '10px',
          background: isPro ? 'var(--orange-dim)' : 'var(--surface2)',
          color: isPro ? 'var(--orange)' : 'var(--text2)',
        }}>
          {isPro ? 'Pro' : 'Free'}
        </span>
      </div>
      <p style={{ margin: '4px 0 16px 0', fontSize: '12px', color: 'var(--muted)' }}>
        Resets on the first of each month. {isPro ? 'All features unlimited on Pro.' : `Upgrade for unlimited access.`}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Row
          label="AI Queries"
          highlight={!isPro && queries >= FREE_QUERY_LIMIT}
          body={isPro ? `${queries} used` : `${queries} / ${FREE_QUERY_LIMIT} used`}
        />
        <Row
          label="Deep Dives"
          highlight={!isPro && deepDives >= FREE_DEEPDIVE_LIMIT}
          body={isPro ? `${deepDives} generated` : `${deepDives} / ${FREE_DEEPDIVE_LIMIT} used`}
        />
        <Row
          label="Event Briefings"
          highlight={!isPro}
          body={isPro ? `${events} generated` : 'Pro only'}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Reflections Match card
// ============================================================================

interface ReflectionsMatchCardProps {
  userDoc: DaymakerUser | null | undefined;
  onUpdated: () => void;
}

function ReflectionsMatchCard({ userDoc, onUpdated }: ReflectionsMatchCardProps) {
  const connected = !!userDoc?.rmConnected;
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'refresh' | 'disconnect'>(null);
  const [error, setError] = useState('');

  const personaTraits: string[] = userDoc?.rmPersonaTraits || [];
  const expertise: RmExpertiseArea[] = userDoc?.rmExpertise || [];
  const activeThemes: RmActiveTheme[] = userDoc?.rmActiveThemes || [];
  const interests: string[] = userDoc?.rmTrackingInterests || [];
  const rmNorthStar = userDoc?.rmNorthStar || '';

  const lastSynced = userDoc?.rmLastSyncedAt
    ? (() => {
        const raw: any = userDoc.rmLastSyncedAt;
        const d = raw?.toDate ? raw.toDate() : new Date(raw.seconds ? raw.seconds * 1000 : raw);
        return d.toLocaleString();
      })()
    : null;

  const authedFetch = async (path: string, body?: unknown) => {
    const token = await getAuth()?.currentUser?.getIdToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  };

  const handleConnect = async () => {
    setError('');
    if (!apiKey.trim()) { setError('Paste your Reflections Match API key to continue.'); return; }
    setBusy('connect');
    try {
      await authedFetch('/api/rm/connect', { apiKey: apiKey.trim() });
      setApiKey('');
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Could not validate that key.');
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setError('');
    setBusy('refresh');
    try {
      await authedFetch('/api/rm/refresh');
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Refresh failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Reflections Match? Your persona data will be removed from Daymaker and AI prompts will fall back to generic defaults.')) return;
    setError('');
    setBusy('disconnect');
    try {
      await authedFetch('/api/rm/disconnect');
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Disconnect failed.');
    } finally {
      setBusy(null);
    }
  };

  const headerBg = 'linear-gradient(145deg, var(--surface) 0%, #2a1645 100%)';

  return (
    <div className="card" style={{ padding: '24px', background: headerBg, border: '1px solid #4a2185' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
        </svg>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#e9d5ff' }}>Reflections Match</h3>
        {connected && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.15)', color: '#86efac', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Connected ✓
          </span>
        )}
      </div>

      {!connected ? (
        <>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#c084fc', lineHeight: 1.5 }}>
            Connect your Reflections Match digital twin to personalize every AI recommendation with your real expertise, goals, and active themes.
          </p>
          <label style={{ display: 'block', fontSize: '12px', color: '#c084fc', marginBottom: '6px', fontWeight: 600 }}>
            Reflections Match API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="rm_live_..."
            autoComplete="off"
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(15, 14, 12, 0.6)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              color: 'var(--text)',
              borderRadius: '6px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <div style={{ fontSize: '11px', color: '#c084fc', marginTop: '6px', opacity: 0.85 }}>
            Generate a &quot;Context&quot; or &quot;Depth&quot; tier key in Reflections Match → Settings → Twin API.
          </div>
          {error && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: '16px' }}>
            <button
              onClick={handleConnect}
              disabled={busy === 'connect'}
              className="btn"
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                border: '1px solid #a855f7',
                color: '#fff',
                fontWeight: 600,
                opacity: busy === 'connect' ? 0.6 : 1,
                cursor: busy === 'connect' ? 'not-allowed' : 'pointer',
              }}
            >
              {busy === 'connect' ? 'Validating...' : 'Connect'}
            </button>
          </div>
        </>
      ) : (
        <>
          {rmNorthStar && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>North Star (from RM)</div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text)', lineHeight: 1.5, fontStyle: 'italic' }}>
                &ldquo;{rmNorthStar}&rdquo;
              </p>
            </div>
          )}

          {personaTraits.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Core Traits</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {personaTraits.map((trait, i) => (
                  <span key={i} style={{
                    padding: '4px 12px',
                    borderRadius: '14px',
                    background: 'rgba(168, 85, 247, 0.18)',
                    color: '#d8b4fe',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}>
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          {expertise.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Expertise</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {expertise.slice(0, 6).map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text)' }}>
                    <span style={{ flex: 1 }}>{e.area}</span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(168, 85, 247, 0.12)',
                      color: '#c4b5fd',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontWeight: 600,
                    }}>
                      {e.depth}{e.yearsOfExperience != null ? ` · ${e.yearsOfExperience}y` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeThemes.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Active Themes</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {activeThemes.map((t, i) => (
                  <span key={i} title={t.description} style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: t.strength === 'high' ? 'rgba(249, 148, 30, 0.18)' : 'rgba(168, 85, 247, 0.12)',
                    color: t.strength === 'high' ? 'var(--orange)' : '#c4b5fd',
                    border: `1px solid ${t.strength === 'high' ? 'rgba(249, 148, 30, 0.4)' : 'rgba(168, 85, 247, 0.3)'}`,
                    fontSize: '11px',
                    fontWeight: 600,
                  }}>
                    {t.theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {interests.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Tracking Interests</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                {interests.join(' · ')}
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(168, 85, 247, 0.2)' }}>
            <div style={{ fontSize: '11px', color: '#c084fc', opacity: 0.85 }}>
              {lastSynced ? `Last synced: ${lastSynced}` : 'Not yet synced'}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleRefresh}
                disabled={busy === 'refresh'}
                className="btn"
                style={{ padding: '8px 14px', fontSize: '12px', background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe', border: '1px solid rgba(168, 85, 247, 0.4)', opacity: busy === 'refresh' ? 0.6 : 1, cursor: busy === 'refresh' ? 'not-allowed' : 'pointer' }}
              >
                {busy === 'refresh' ? 'Refreshing...' : 'Refresh from Reflections Match'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={busy === 'disconnect'}
                className="btn"
                style={{ padding: '8px 14px', fontSize: '12px', background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', opacity: busy === 'disconnect' ? 0.6 : 1, cursor: busy === 'disconnect' ? 'not-allowed' : 'pointer' }}
              >
                {busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
