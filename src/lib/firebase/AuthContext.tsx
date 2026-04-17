'use client';

/**
 * DAYMAKER CONNECT — Auth Context Provider
 *
 * Provides auth state (user, loading) to all client components.
 * Wraps Firebase onAuthStateChanged.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged } from './auth';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      // OVERRIDE: Force a mock user to bypass auth for preview
      setUser(firebaseUser || {
        uid: 'demo-bypassed-uid',
        email: 'demo@preview.com',
        displayName: 'Preview User'
      });
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
