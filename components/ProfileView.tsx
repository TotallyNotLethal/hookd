'use client';

import Image from 'next/image';
import { useMemo } from 'react';

type Profile = {
  uid?: string;
  displayName?: string;
  username?: string;
  bio?: string;
  header?: string;
  photoURL?: string;
  email?: string;
  followers?: any[];
  following?: any[];
  isTester?: boolean;
};

type Catch = {
  id: string;
  imageUrl: string;
  species?: string;
  weight?: string;
  trophy?: boolean;
};

type ProfileViewProps = {
  profile: Profile | null;
  catches: Catch[];
  isOwner?: boolean;
  onEditProfile?: () => void;
};

export default function ProfileView({ profile, catches, isOwner = false, onEditProfile }: ProfileViewProps) {
  const trophyCatches = useMemo(() => catches.filter((catchItem) => catchItem.trophy), [catches]);
  const standardCatches = useMemo(() => catches.filter((catchItem) => !catchItem.trophy), [catches]);

  const avatarSrc = profile?.photoURL || '/logo.svg';
  const headerSrc = profile?.header || avatarSrc;
  const displayName = profile?.displayName || profile?.username || 'Angler';
  const username = profile?.username;

  const followerCount = profile?.followers?.length ?? 0;
  const followingCount = profile?.following?.length ?? 0;

  return (
    <>
      <div className="card overflow-hidden">
        <div className="relative h-40 w-full">
          <Image src={headerSrc} alt="Header" fill className="object-cover opacity-60" />
        </div>
        <div className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Image
              src={avatarSrc}
              alt={profile?.displayName || 'Profile avatar'}
              width={80}
              height={80}
              className="rounded-2xl -mt-12 border-4 border-[var(--card)] object-cover"
            />
            <div className="flex-1">
              <h1 className={`text-2xl font-semibold${profile?.isTester ? ' text-brand-300' : ''}`}>{displayName}</h1>
              {(username || profile?.isTester) && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
                  {username && <span>@{username}</span>}
                  {profile?.isTester && (
                    <span
                      className="flex items-center gap-1 rounded-full border border-blue-400/40 px-2 py-0.5 text-xs text-blue-300"
                      title="Tester"
                    >
                      <span aria-hidden>✔</span>
                      <span className="sr-only">Tester</span>
                    </span>
                  )}
                </div>
              )}
              {profile?.email && <p className="text-white/60 break-all">{profile.email}</p>}
              <p className="text-white/70 text-sm mt-1">
                <span className="font-medium">{followerCount}</span> followers •{' '}
                <span className="font-medium">{followingCount}</span> following
              </p>
            </div>
            {isOwner && onEditProfile && (
              <div className="sm:ml-auto">
                <button className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5" onClick={onEditProfile}>
                  Edit Profile
                </button>
              </div>
            )}
          </div>
          {profile?.bio && <p className="text-white/80 mt-4">{profile.bio}</p>}
        </div>
      </div>

      <section aria-label="Trophy catches" className="mt-8">
        <h2 className="mb-3 text-lg text-white/80">Trophy Catches</h2>
        {trophyCatches.length ? (
          <div className="flex gap-4 overflow-auto pb-2">
            {trophyCatches.map((trophy) => (
              <div
                key={trophy.id}
                className="min-w-[260px] h-[180px] relative rounded-2xl overflow-hidden border border-white/10"
              >
                <Image src={trophy.imageUrl} alt={trophy.species || 'trophy catch'} fill className="object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-2 text-sm bg-gradient-to-t from-black/60 to-transparent">
                  <span className="font-medium">{trophy.species}</span>
                  {trophy.weight ? ` • ${trophy.weight}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/60">No trophies yet. Mark a catch as a trophy when you upload.</p>
        )}
      </section>

      <section aria-label="All catches" className="mt-8">
        <h2 className="mb-3 text-lg text-white/80">All Catches</h2>
        {standardCatches.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {standardCatches.map((catchItem) => (
              <div
                key={catchItem.id}
                className="relative aspect-square rounded-2xl overflow-hidden border border-white/10"
              >
                <Image src={catchItem.imageUrl} alt={catchItem.species || 'catch'} fill className="object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/60">No catches posted yet.</p>
        )}
      </section>
    </>
  );
}
