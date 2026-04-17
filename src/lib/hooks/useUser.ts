import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/AuthContext';
import type { DaymakerUser } from '@/lib/types';

const fetchUserDoc = async (uid: string): Promise<DaymakerUser | null> => {
  const db = getDb();
  if (!db || !uid) throw new Error('Database or User not initialized');

  const docRef = doc(db, 'users', uid);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as DaymakerUser;
};

export function useUser() {
  const { user: authUser, loading: authLoading } = useAuth();
  
  const uid = authUser?.uid || null;

  const { data: userDoc, error, mutate, isLoading: isSWRloading } = useSWR<DaymakerUser | null>(
    uid ? `user_${uid}` : null,
    () => fetchUserDoc(uid!),
    {
      revalidateOnFocus: false, // Don't spam fetches on tab switch
    }
  );

  return {
    userDoc,
    isLoading: authLoading || isSWRloading,
    isError: error,
    mutate,
  };
}
