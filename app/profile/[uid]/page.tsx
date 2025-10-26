'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

import NavBar from '@/components/NavBar';
import ProfileView from '@/components/ProfileView';
import { app } from '@/lib/firebaseClient';
import { followUser, subscribeToUser, subscribeToUserCatches, unfollowUser } from '@/lib/firestore';
import PostDetailModal from '@/app/feed/PostDetailModal';

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
  caption?: string;
  location?: string;
  locationPrivate?: boolean;
  displayName?: string;
  createdAt?: any;
  uid?: string;
  user?: { name?: string };
  userPhoto?: string;
  likesCount?: number;
  commentsCount?: number;
  [key: string]: any;
};

export default function ProfilePage() {
  const params = useParams<{ uid: string }>();
  const userId = params?.uid;
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [catches, setCatches] = useState<CatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [followPending, setFollowPending] = useState(false);
  const [activeCatch, setActiveCatch] = useState<CatchData | null>(null);

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
    setActiveCatch(null);

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
  const isFollowing = useMemo(() => {
    if (!authUser || !profile) return false;
    const followers = Array.isArray(profile.followers) ? profile.followers : [];
    return followers.includes(authUser.uid);
  }, [authUser, profile]);

  const handleToggleFollow = useCallback(async () => {
    if (!authUser || !profile?.uid || authUser.uid === profile.uid || followPending) return;

    setFollowPending(true);
    try {
      if (isFollowing) {
        await unfollowUser(authUser.uid, profile.uid);
      } else {
        await followUser(authUser.uid, profile.uid);
      }
    } finally {
      setFollowPending(false);
    }
  }, [authUser, profile, isFollowing, followPending]);

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-10">
        {loading ? (
          <div className="card p-6">
            <p className="text-white/70">Loading profile…</p>
          </div>
        ) : profile ? (
          <ProfileView
            profile={profile}
            catches={catches}
            isOwner={isOwner}
            isFollowing={isFollowing}
            onToggleFollow={!isOwner && authUser ? handleToggleFollow : undefined}
            followPending={followPending}
            onCatchSelect={(catchItem) => setActiveCatch(catchItem)}
          />
        ) : (
          <div className="card p-6">
            <p className="text-white/70">Profile not found.</p>
          </div>
        )}
      </section>
      {activeCatch && (
        <PostDetailModal post={activeCatch} onClose={() => setActiveCatch(null)} />
      )}
    </main>
  );
}
