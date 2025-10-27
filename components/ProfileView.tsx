'use client';

import Image from 'next/image';
import { type KeyboardEvent, useMemo } from 'react';
import { Fish, Medal, Scale, Sparkles } from 'lucide-react';

import { summarizeCatchMetrics, type CatchSummary } from '@/lib/catchStats';

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
  [key: string]: any;
};

type ProfileViewProps = {
  profile: Profile | null;
  catches: Catch[];
  isOwner?: boolean;
  onEditProfile?: () => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  followPending?: boolean;
  onCatchSelect?: (catchItem: Catch) => void;
  catchSummary?: CatchSummary;
};

export default function ProfileView({
  profile,
  catches,
  isOwner = false,
  onEditProfile,
  isFollowing = false,
  onToggleFollow,
  followPending = false,
  onCatchSelect,
  catchSummary,
}: ProfileViewProps) {
  const trophyCatches = useMemo(() => catches.filter((catchItem) => catchItem.trophy), [catches]);
  const standardCatches = useMemo(() => catches.filter((catchItem) => !catchItem.trophy), [catches]);
  const stats = useMemo(
    () => catchSummary ?? summarizeCatchMetrics(catches),
    [catchSummary, catches],
  );

  const avatarSrc = profile?.photoURL || '/logo.svg';
  const headerSrc = profile?.header || avatarSrc;
  const displayName = profile?.displayName || profile?.username || 'Angler';
  const username = profile?.username;
  const usernameDisplay = useMemo(() => {
    if (!username) return null;
    return profile?.isTester ? `@hookd_${username}` : `@${username}`;
  }, [profile?.isTester, username]);

  const followerCount = profile?.followers?.length ?? 0;
  const followingCount = profile?.following?.length ?? 0;
  const personalBestWeight = stats.personalBest?.weightText ?? '—';
  const personalBestSpecies = stats.personalBest?.species;

  const handleCatchKeyDown = (event: KeyboardEvent<HTMLDivElement>, catchItem: Catch) => {
    if (!onCatchSelect) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCatchSelect(catchItem);
    }
  };

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
              <h1 className="text-2xl font-semibold">{displayName}</h1>
              {usernameDisplay && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
                  <span
                    className={`flex items-center gap-1 ${profile?.isTester ? 'text-brand-300 font-semibold' : ''}`}
                  >
                    {usernameDisplay}
                    {profile?.isTester && (
                      <span aria-hidden className="text-brand-300">
                        🎣✔
                      </span>
                    )}
                    {profile?.isTester && <span className="sr-only">Tester</span>}
                  </span>
                </div>
              )}
              {profile?.email && <p className="text-white/60 break-all">{profile.email}</p>}
              <p className="text-white/70 text-sm mt-1">
                <span className="font-medium">{followerCount}</span> followers •{' '}
                <span className="font-medium">{followingCount}</span> following
              </p>
            </div>
            <div className="sm:ml-auto flex items-center gap-2">
              {!isOwner && onToggleFollow && (
                <button
                  className={`px-4 py-2 rounded-xl border transition ${
                    isFollowing
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-brand-400 text-brand-100 hover:bg-brand-400/10'
                  } ${followPending ? 'opacity-60 cursor-not-allowed' : 'hover:border-brand-300'}`}
                  onClick={onToggleFollow}
                  disabled={followPending}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              )}
              {isOwner && onEditProfile && (
                <button className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5" onClick={onEditProfile}>
                  Edit Profile
                </button>
              )}
            </div>
          </div>
          {profile?.bio && <p className="text-white/80 mt-4">{profile.bio}</p>}
        </div>
      </div>

      <div className="card mt-6">
        <div className="p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
            <Sparkles aria-hidden className="h-5 w-5 text-brand-200" />
            Angler Stats
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              title="Total number of catches shared by this angler"
            >
              <div className="rounded-xl bg-brand-500/20 p-2">
                <Fish aria-hidden className="h-5 w-5 text-brand-200" />
              </div>
              <div>
                <dt className="text-sm text-white/60">Total Catches</dt>
                <dd className="text-xl font-semibold text-white">{stats.totalCatches}</dd>
              </div>
            </div>

            <div
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              title="How many catches were marked as trophies"
            >
              <div className="rounded-xl bg-amber-400/20 p-2">
                <Medal aria-hidden className="h-5 w-5 text-amber-200" />
              </div>
              <div>
                <dt className="text-sm text-white/60">Trophies</dt>
                <dd className="text-xl font-semibold text-white">{stats.trophyCount}</dd>
              </div>
            </div>

            <div
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              title="Distinct species featured in posted catches"
            >
              <div className="rounded-xl bg-emerald-400/20 p-2">
                <Sparkles aria-hidden className="h-5 w-5 text-emerald-200" />
              </div>
              <div>
                <dt className="text-sm text-white/60">Unique Species</dt>
                <dd className="text-xl font-semibold text-white">{stats.uniqueSpeciesCount}</dd>
              </div>
            </div>

            <div
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              title="Heaviest recorded catch based on provided weight"
            >
              <div className="rounded-xl bg-sky-400/20 p-2">
                <Scale aria-hidden className="h-5 w-5 text-sky-200" />
              </div>
              <div>
                <dt className="text-sm text-white/60">Personal Best</dt>
                <dd className="text-xl font-semibold text-white">{personalBestWeight}</dd>
                {personalBestSpecies && (
                  <p className="text-xs text-white/60">{personalBestSpecies}</p>
                )}
              </div>
            </div>
          </dl>
        </div>
      </div>

      <section aria-label="Trophy catches" className="mt-8">
        <h2 className="mb-3 text-lg text-white/80">Trophy Catches</h2>
        {trophyCatches.length ? (
          <div className="flex gap-4 overflow-auto pb-2">
            {trophyCatches.map((trophy) => (
              <div
                key={trophy.id}
                className={`min-w-[260px] h-[180px] relative rounded-2xl overflow-hidden border border-white/10 ${
                  onCatchSelect
                    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'
                    : ''
                }`}
                role={onCatchSelect ? 'button' : undefined}
                tabIndex={onCatchSelect ? 0 : undefined}
                onClick={onCatchSelect ? () => onCatchSelect(trophy) : undefined}
                onKeyDown={onCatchSelect ? (event) => handleCatchKeyDown(event, trophy) : undefined}
                aria-label={
                  onCatchSelect ? `Open details for ${trophy.species || 'catch'}` : undefined
                }
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
                className={`relative aspect-square rounded-2xl overflow-hidden border border-white/10 ${
                  onCatchSelect
                    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'
                    : ''
                }`}
                role={onCatchSelect ? 'button' : undefined}
                tabIndex={onCatchSelect ? 0 : undefined}
                onClick={onCatchSelect ? () => onCatchSelect(catchItem) : undefined}
                onKeyDown={onCatchSelect ? (event) => handleCatchKeyDown(event, catchItem) : undefined}
                aria-label={
                  onCatchSelect ? `Open details for ${catchItem.species || 'catch'}` : undefined
                }
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
