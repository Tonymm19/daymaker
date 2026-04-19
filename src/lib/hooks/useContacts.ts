import useSWR from 'swr';
import { collection, getDocs, limit as fsLimit, orderBy, query } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/AuthContext';

import { Contact } from '@/lib/types';

type Mode = 'recent' | 'full';

async function fetchContacts(uid: string, mode: Mode, recentLimit: number): Promise<Contact[]> {
  const db = getDb();
  if (!db || !uid) throw new Error('Database or User not initialized');

  const contactsRef = collection(db, `users/${uid}/contacts`);

  if (mode === 'recent') {
    // Fast path for initial dashboard paint: N most recently connected.
    // Firestore auto-creates the single-field index on connectedOn.
    const q = query(contactsRef, orderBy('connectedOn', 'desc'), fsLimit(recentLimit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), docId: d.id } as unknown as Contact));
  }

  const snap = await getDocs(query(contactsRef));
  const contacts = snap.docs.map((d) => ({ ...d.data(), docId: d.id } as unknown as Contact));
  return contacts.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export interface UseContactsOptions {
  mode?: Mode;
  recentLimit?: number;
}

export function useContacts(options: UseContactsOptions = {}) {
  const mode: Mode = options.mode ?? 'full';
  const recentLimit = options.recentLimit ?? 50;

  const { user } = useAuth();

  const key = user
    ? mode === 'recent'
      ? `contacts_${user.uid}_recent_${recentLimit}`
      : `contacts_${user.uid}_all`
    : null;

  const { data, error, mutate, isLoading } = useSWR<Contact[]>(
    key,
    () => fetchContacts(user!.uid, mode, recentLimit),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      // Keep the previous mode's data visible while we upgrade recent → full
      // so the dashboard doesn't flash back to a spinner mid-session.
      keepPreviousData: true,
    }
  );

  return {
    contacts: data || [],
    mode,
    isLoading,
    isError: error,
    mutate,
  };
}
