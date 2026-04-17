import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/AuthContext';

import { Contact } from '@/lib/types';

const fetchContacts = async (uid: string): Promise<Contact[]> => {
  const db = getDb();
  if (!db || !uid) throw new Error('Database or User not initialized');

  const contactsRef = collection(db, `users/${uid}/contacts`);
  // Order by fullName ascending (fallback to just simple fetch if no index)
  // To avoid requiring a composite index right away, we just fetch all and sort client-side, 
  // or use a simple getDocs. Since it's < 10k docs, it's fast enough. SWR will cache it.
  const q = query(contactsRef);
  const snapshot = await getDocs(q);

  const contacts = snapshot.docs.map((doc) => {
    return {
      ...doc.data(),
      docId: doc.id
    } as unknown as Contact;
  });

  // Sort client-side to save on creating a specific firestore index
  return contacts.sort((a, b) => a.fullName.localeCompare(b.fullName));
};

export function useContacts() {
  const { user } = useAuth();

  const { data, error, mutate, isLoading } = useSWR<Contact[]>(
    user ? `contacts_${user.uid}` : null,
    () => fetchContacts(user!.uid),
    {
      revalidateOnFocus: false, // Don't refetch on every window focus for 10k contacts
      dedupingInterval: 60000,  // Cache for 1 min
    }
  );

  return {
    contacts: data || [],
    isLoading,
    isError: error,
    mutate,
  };
}
