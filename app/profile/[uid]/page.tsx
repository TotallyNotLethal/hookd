'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

import NavBar from '@/components/NavBar';
import ProfileView from '@/components/ProfileView';
import { app } from '@/lib/firebaseClient';
import { subscribeToUser, subscribeToUserCatches } from '@/lib/firestore';

type ProfileData = {
  uid: string;
  displayName?: string;
  username?: string;
  bio?: string;
  photoURL?: string;
  header?: string;
  followers?: any[];
  following?: any[];
  isTester?: boolean;
};

type CatchData = {
  id: string;
  imageUrl: string;
  species?: string;
  weight?: string;
  trophy?: boolean;
};

export default function ProfilePage() {
  const params = useParams<{ uid: string }>();
  const userId = params?.uid;
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [catches, setCatches] = useState<CatchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    setProfile(null);
    setCatches([]);

    const unsubscribeProfile = subscribeToUser(userId, (data) => {
      setProfile(data);
      setLoading(false);
    });
    const unsubscribeCatches = subscribeToUserCatches(userId, (data) => setCatches(data));

    return () => {
      unsubscribeProfile();
      unsubscribeCatches();
    };
  }, [userId]);

  const isOwner = authUser?.uid === userId;

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-10">
        {loading ? (
          <div className="card p-6">
            <p className="text-white/70">Loading profile…</p>
          </div>
        ) : profile ? (
          <ProfileView profile={profile} catches={catches} isOwner={isOwner} />
        ) : (
          <div className="card p-6">
            <p className="text-white/70">Profile not found.</p>
          </div>
        )}
      </section>
    </main>
  );
}
