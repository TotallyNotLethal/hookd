'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import { app } from '@/lib/firebaseClient';
import { HookdUser, subscribeToUser } from '@/lib/firestore';

type ProAccessState = {
  isPro: boolean;
  loading: boolean;
  profile: HookdUser | null;
};

export function useProAccess(): ProAccessState {
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;

      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      unsubscribeProfile = subscribeToUser(authUser.uid, (data) => {
        setProfile(data);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const isPro = useMemo(() => Boolean(profile?.isPro), [profile?.isPro]);

  return useMemo(
    () => ({ isPro, loading, profile }),
    [isPro, loading, profile],
  );
}
