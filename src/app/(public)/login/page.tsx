'use client';

/**
 * Login page — email/password + Google sign-in.
 * Redirects to /dashboard if already authenticated.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn, signInWithGoogle, sendPasswordReset } from '@/lib/firebase/auth';
import { onAuthStateChanged } from '@/lib/firebase/auth';

type Mode = 'signin' | 'reset';

export default function LoginPage() {
  const [email, setEmail] = useState('demo@daymaker.com');
  const [password, setPassword] = useState('daymaker2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('signin');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const router = useRouter();

  // If already signed in, redirect to dashboard
  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      if (user) {
        router.replace('/dashboard');
      } else {
        setChecking(false);
      }
    });
    return unsubscribe;
  }, [router]);

  // Show a one-time banner when arriving back from the reset flow
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      setResetConfirmed(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    let result = await signIn(email, password);
    
    // Auto-create demo account if it doesn't exist yet
    if (!result.success && email === 'demo@daymaker.com' && (result.error?.code === 'auth/invalid-credential' || result.error?.code === 'auth/user-not-found')) {
      const { signUp } = await import('@/lib/firebase/auth');
      result = await signUp(email, password, 'Demo User');
    }
    
    if (!result.success) {
      setError(result.error?.message || 'Sign in failed. Please try again.');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      setError(result.error?.message || 'Google sign in failed.');
    }
    setLoading(false);
  };

  const showResetForm = () => {
    setError('');
    setResetSent(false);
    setResetEmail(email);
    setMode('reset');
  };

  const backToSignIn = () => {
    setError('');
    setResetSent(false);
    setMode('signin');
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await sendPasswordReset(resetEmail);
    if (result.success) {
      setResetSent(true);
    } else {
      const code = result.error?.code;
      if (code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(result.error?.message || 'Could not send reset link. Please try again.');
      }
    }
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

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
      {/* Logo */}
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
          {mode === 'reset' ? 'Reset Password' : 'Sign In'}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '24px' }}>
          {mode === 'reset'
            ? 'Enter your email and we will send a reset link.'
            : 'Welcome back to Daymaker Connect'}
        </p>

        {error && <div className="auth-error">{error}</div>}

        {resetConfirmed && mode === 'signin' && !error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--orange-dim)',
              border: '1px solid var(--orange)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text)',
              marginBottom: '14px',
              lineHeight: 1.5,
            }}
          >
            Your password has been updated. Sign in with your new password.
          </div>
        )}

        {mode === 'signin' && (
          <>
            <form onSubmit={handleSubmit}>
              <input
                id="login-email"
                type="email"
                className="auth-input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                id="login-password"
                type="password"
                className="auth-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px', marginBottom: '12px' }}>
                <button
                  id="login-forgot"
                  type="button"
                  onClick={showResetForm}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '12px',
                    color: 'var(--orange)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <button
                id="login-submit"
                type="submit"
                className="auth-btn"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="auth-divider">or</div>

            <button
              id="login-google"
              type="button"
              className="auth-btn-google"
              onClick={handleGoogle}
              disabled={loading}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                </svg>
                Continue with Google
              </span>
            </button>

            <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text2)' }}>
              Don&apos;t have an account?{' '}
              <Link href="/signup" style={{ color: 'var(--orange)', fontWeight: 600, textDecoration: 'none' }}>
                Create one
              </Link>
            </p>
          </>
        )}

        {mode === 'reset' && (
          <>
            {resetSent ? (
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--orange-dim)',
                  border: '1px solid var(--orange)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: 'var(--text)',
                  marginBottom: '16px',
                  lineHeight: 1.5,
                }}
              >
                Check your email for a reset link. The link expires in 1 hour.
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <input
                  id="reset-email"
                  type="email"
                  className="auth-input"
                  placeholder="Email address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
                <button
                  id="reset-submit"
                  type="submit"
                  className="auth-btn"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            )}

            <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text2)' }}>
              <button
                type="button"
                onClick={backToSignIn}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '13px',
                  color: 'var(--orange)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back to sign in
              </button>
            </p>
          </>
        )}
      </div>

      <div
        style={{
          marginTop: '24px',
          display: 'flex',
          gap: '16px',
          fontSize: '12px',
          color: 'var(--muted)',
        }}
      >
        <Link href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Privacy Policy
        </Link>
        <Link href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Terms
        </Link>
      </div>
    </main>
  );
}
