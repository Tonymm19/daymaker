'use client';

/**
 * Protected layout — Auth guard + TopNav navigation shell.
 * Shows a dark loading screen while checking auth state (no white flash).
 * Redirects to /login if unauthenticated.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/firebase/AuthContext';
import { ensureUserDocument } from '@/lib/firebase/auth';
import TopNav from '@/components/TopNav';

function ProtectedContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      ensureUserDocument(user.uid, user.email, user.displayName).catch(console.error);
    }
  }, [user]);

  // Dark loading screen — premium feel, no white flash
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 500 }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!user) {
    // Will redirect via useEffect above — show dark bg in the meantime
    return <div className="loading-screen" />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--darker)' }}>
      <TopNav />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px 40px' }}>
        {children}
      </main>
    </div>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ProtectedContent>{children}</ProtectedContent>
    </AuthProvider>
  );
}
