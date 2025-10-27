'use client';

import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { type KeyboardEvent, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, Fish, Medal, MessageCircle, Scale, Sparkles } from 'lucide-react';
import rehypeSanitize from 'rehype-sanitize';
import type { Components as MarkdownComponents } from 'react-markdown';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

import {
  summarizeCatchMetrics,
  type CatchSummary,
} from '@/lib/catchStats';
import {
  DEFAULT_PROFILE_THEME,
  PROFILE_ACCENT_OPTIONS,
  PROFILE_BACKGROUND_TEXTURES,
  PROFILE_LAYOUT_OPTIONS,
  coerceProfileTheme,
} from '@/lib/profileThemeOptions';
import type { ProfileTheme } from '@/lib/firestore';

const ABOUT_ALLOWED_TAGS = ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'blockquote', 'br'] as const;

const ABOUT_SANITIZE_SCHEMA: RehypeSanitizeOptions = {
  tagNames: ABOUT_ALLOWED_TAGS as unknown as string[],
  attributes: {
    a: ['href', 'target', 'rel'],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
  },
};

const ABOUT_MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="accent-link"
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code {...props} className="about-inline-code" />
  ),
};

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
  about?: string;
  profileTheme?: Partial<ProfileTheme> | null;
};

type Catch = {
  id: string;
  imageUrl?: string;
  species?: string;
  weight?: string;
  trophy?: boolean;
  caption?: string;
  [key: string]: any;
};

type ProfileViewProps = {
  profile: Profile | null;
  catches: Catch[];
  isOwner?: boolean;
  onEditProfile?: () => void;
  onOpenLogbook?: () => void;
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
  onOpenLogbook,
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

  const theme = useMemo(() => {
    try {
      return coerceProfileTheme(profile?.profileTheme ?? null, DEFAULT_PROFILE_THEME);
    } catch {
      return DEFAULT_PROFILE_THEME;
    }
  }, [profile?.profileTheme]);

  const accent = PROFILE_ACCENT_OPTIONS[theme.accentColor];
  const background = PROFILE_BACKGROUND_TEXTURES[theme.backgroundTexture];
  const layout = PROFILE_LAYOUT_OPTIONS[theme.layoutVariant];

  const featuredCatch = theme.featuredCatchId
    ? catches.find((catchItem) => catchItem.id === theme.featuredCatchId)
    : null;

  const wrapperClasses = clsx(
    'profile-theme flex flex-col',
    layout.wrapperClass,
    accent.className,
    background.className,
  );
  const introClasses = clsx(
    'profile-intro w-full',
    layout.introClass,
    featuredCatch && layout.introWithHeroClass,
  );
  const headerCardClasses = clsx(
    'card overflow-hidden profile-header-card relative',
    layout.headerCardClass,
  );
  const heroCardClasses = clsx('card overflow-hidden profile-featured-card', layout.heroCardClass);

  const followerCount = profile?.followers?.length ?? 0;
  const followingCount = profile?.following?.length ?? 0;
  const personalBestWeight = stats.personalBest?.weightText ?? '—';
  const personalBestSpecies = stats.personalBest?.species;

  const aboutContent = profile?.about?.trim();

  const handleCatchKeyDown = (event: KeyboardEvent<HTMLDivElement>, catchItem: Catch) => {
    if (!onCatchSelect) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCatchSelect(catchItem);
    }
  };

  return (
    <div className={wrapperClasses}>
      <div className={introClasses}>
        <div className={headerCardClasses}>
          <div className="relative h-40 w-full">
            <Image src={headerSrc} alt="Header" fill className="object-cover opacity-70" />
            <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/20 via-black/40 to-black/70" />
          </div>
          <div className="relative z-20 p-4 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Image
                src={avatarSrc}
                alt={profile?.displayName || 'Profile avatar'}
                width={80}
                height={80}
                className="relative z-30 -mt-12 rounded-2xl border-4 border-[var(--card)] object-cover shadow-lg"
              />
              <div className="flex-1">
                <h1 className="text-2xl font-semibold">{displayName}</h1>
                {usernameDisplay && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
                    <span
                      className={clsx(
                        'flex items-center gap-1',
                        profile?.isTester ? 'text-[var(--profile-accent-strong)] font-semibold' : undefined,
                      )}
                    >
                      {usernameDisplay}
                      {profile?.isTester && (
                        <span aria-hidden className="text-[var(--profile-accent-strong)]">
                          🎣✔
                        </span>
                      )}
                      {profile?.isTester && <span className="sr-only">Tester</span>}
                    </span>
                  </div>
                )}
                {profile?.email && <p className="break-all text-white/60">{profile.email}</p>}
                <p className="mt-1 text-sm text-white/70">
                  <span className="font-medium">{followerCount}</span> followers •{' '}
                  <span className="font-medium">{followingCount}</span> following
                </p>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                {!isOwner && onToggleFollow && (
                  <button
                    className={clsx(
                      'rounded-xl border px-4 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)]',
                      isFollowing
                        ? 'border-white/30 bg-white/10 text-white'
                        : 'border-[var(--profile-accent-border)] text-[var(--profile-accent-strong)] hover:bg-[var(--profile-accent-soft)]',
                      followPending ? 'cursor-not-allowed opacity-60' : 'hover:border-[var(--profile-accent-border)]',
                    )}
                    onClick={onToggleFollow}
                    disabled={followPending}
                  >
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                )}
                {!isOwner && profile?.uid && (
                  <Link
                    href={`/messages/${profile.uid}`}
                    prefetch={false}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Link>
                )}
                {isOwner && onEditProfile && (
                  <button
                    className="rounded-xl border border-white/15 px-4 py-2 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)]"
                    onClick={onEditProfile}
                  >
                    Edit Profile
                  </button>
                )}
                {isOwner && onOpenLogbook && (
                  <button
                    type="button"
                    onClick={onOpenLogbook}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)]"
                  >
                    <BookOpen className="h-4 w-4" />
                    Manage Logbook
                  </button>
                )}
              </div>
            </div>
            {profile?.bio && <p className="mt-4 text-white/80">{profile.bio}</p>}
          </div>
        </div>

        {featuredCatch && featuredCatch.imageUrl && (
          <div className={heroCardClasses}>
            <div className="relative h-full min-h-[220px] w-full">
              <Image
                src={featuredCatch.imageUrl}
                alt={featuredCatch.species || 'Featured catch'}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--profile-accent-strong)]">
                  Featured Catch
                </p>
                <h3 className="text-lg font-semibold text-white">
                  {featuredCatch.species || 'Catch'}
                </h3>
                {featuredCatch.weight && (
                  <p className="text-sm text-white/70">{featuredCatch.weight}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {aboutContent && (
        <section className="card p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
            <Sparkles aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
            About
          </h2>
          <ReactMarkdown
            className="markdown mt-3"
            rehypePlugins={[[rehypeSanitize, ABOUT_SANITIZE_SCHEMA]]}
            components={ABOUT_MARKDOWN_COMPONENTS}
          >
            {aboutContent}
          </ReactMarkdown>
        </section>
      )}

      <div className="card p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
          <Sparkles aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
          Angler Stats
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            title="Total number of catches shared by this angler"
          >
            <div className="accent-chip">
              <Fish aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
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
            <div className="accent-chip">
              <Medal aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
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
            <div className="accent-chip">
              <Sparkles aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
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
            <div className="accent-chip">
              <Scale aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
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

      <section aria-label="Trophy catches" className="mt-8">
        <h2 className="mb-3 text-lg text-white/80">Trophy Catches</h2>
        {trophyCatches.length ? (
          <div className="flex gap-4 overflow-auto pb-2">
            {trophyCatches.map((trophy) => {
              const imageSrc = trophy.imageUrl || '/logo.svg';
              return (
                <div
                  key={trophy.id}
                  className={clsx(
                    'relative h-[180px] min-w-[260px] overflow-hidden rounded-2xl border border-white/10',
                    onCatchSelect &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)] hover:border-[var(--profile-accent-border)]',
                  )}
                  role={onCatchSelect ? 'button' : undefined}
                  tabIndex={onCatchSelect ? 0 : undefined}
                  onClick={onCatchSelect ? () => onCatchSelect(trophy) : undefined}
                  onKeyDown={onCatchSelect ? (event) => handleCatchKeyDown(event, trophy) : undefined}
                  aria-label={
                    onCatchSelect ? `Open details for ${trophy.species || 'catch'}` : undefined
                  }
                >
                  <Image src={imageSrc} alt={trophy.species || 'trophy catch'} fill className="object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-sm">
                    <span className="font-medium">{trophy.species}</span>
                    {trophy.weight ? ` • ${trophy.weight}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-white/60">No trophies yet. Mark a catch as a trophy when you upload.</p>
        )}
      </section>

      <section aria-label="All catches" className="mt-8">
        <h2 className="mb-3 text-lg text-white/80">All Catches</h2>
        {standardCatches.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {standardCatches.map((catchItem) => {
              const imageSrc = catchItem.imageUrl || '/logo.svg';
              return (
                <div
                  key={catchItem.id}
                  className={clsx(
                    'relative aspect-square overflow-hidden rounded-2xl border border-white/10',
                    onCatchSelect &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)] hover:border-[var(--profile-accent-border)]',
                  )}
                  role={onCatchSelect ? 'button' : undefined}
                  tabIndex={onCatchSelect ? 0 : undefined}
                  onClick={onCatchSelect ? () => onCatchSelect(catchItem) : undefined}
                  onKeyDown={onCatchSelect ? (event) => handleCatchKeyDown(event, catchItem) : undefined}
                  aria-label={
                    onCatchSelect ? `Open details for ${catchItem.species || 'catch'}` : undefined
                  }
                >
                  <Image src={imageSrc} alt={catchItem.species || 'catch'} fill className="object-cover" />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-white/60">No catches posted yet.</p>
        )}
      </section>
    </div>
  );
}
