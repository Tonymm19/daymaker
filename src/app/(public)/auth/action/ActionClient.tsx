'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { verifyResetCode, confirmReset } from '@/lib/firebase/auth';

type Status = 'verifying' | 'ready' | 'invalid' | 'submitting' | 'done';

export default function ActionClient({ mode, oobCode }: { mode: string; oobCode: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('verifying');
  const [accountEmail, setAccountEmail] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (mode !== 'resetPassword' || !oobCode) {
        setError('This action link is invalid or unsupported.');
        setStatus('invalid');
        return;
      }
      const result = await verifyResetCode(oobCode);
      if (cancelled) return;
      if (result.success && result.email) {
        setAccountEmail(result.email);
        setStatus('ready');
      } else {
        const code = result.error?.code;
        if (code === 'auth/expired-action-code') {
          setError('This reset link has expired. Please request a new one.');
        } else if (code === 'auth/invalid-action-code') {
          setError('This reset link is invalid or has already been used.');
        } else {
          setError(result.error?.message || 'This reset link could not be verified.');
        }
        setStatus('invalid');
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setStatus('submitting');
    const result = await confirmReset(oobCode, password);
    if (result.success) {
      setStatus('done');
      setTimeout(() => {
        router.replace('/login?reset=1');
      }, 2000);
    } else {
      const code = result.error?.code;
      if (code === 'auth/weak-password') {
        setError('Password is too weak. Try a longer one.');
      } else if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        setError('This reset link is no longer valid. Please request a new one.');
      } else {
        setError(result.error?.message || 'Could not reset password. Please try again.');
      }
      setStatus('ready');
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--darker)',
      }}
    >
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--orange), #c47010)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#0E1B24" strokeWidth="2" width="24" height="24">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '-0.5px' }}>
          Daymaker <span style={{ color: 'var(--text)', fontWeight: 400 }}>Connect</span>
        </div>
      </div>

      <div className="auth-card">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '24px',
            fontWeight: 400,
            color: 'var(--text)',
            marginBottom: '4px',
          }}
        >
          Set new password
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '24px' }}>
          {status === 'ready' || status === 'submitting'
            ? `Choose a new password for ${accountEmail}.`
            : status === 'done'
            ? 'Password updated.'
            : status === 'verifying'
            ? 'Verifying your reset link...'
            : 'We could not verify this reset link.'}
        </p>

        {error && <div className="auth-error">{error}</div>}

        {(status === 'ready' || status === 'submitting') && (
          <form onSubmit={handleSubmit}>
            <input
              id="reset-new-password"
              type="password"
              className="auth-input"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
            <input
              id="reset-confirm-password"
              type="password"
              className="auth-input"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              id="reset-confirm-submit"
              type="submit"
              className="auth-btn"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}

        {status === 'done' && (
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--orange-dim)',
              border: '1px solid var(--orange)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text)',
              lineHeight: 1.5,
            }}
          >
            Your password has been updated. Redirecting to sign in...
          </div>
        )}

        {status === 'invalid' && (
          <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text2)' }}>
            <Link href="/login" style={{ color: 'var(--orange)', fontWeight: 600, textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
