'use client';

import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { type JSX, type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, Fish, Medal, MessageCircle, Scale, Sparkles, Users } from 'lucide-react';
import rehypeSanitize from 'rehype-sanitize';
import type { Components as MarkdownComponents } from 'react-markdown';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

import {
  summarizeCatchMetrics,
  type CatchSummary,
  type CatchEnvironmentSummary,
} from '@/lib/catchStats';
import {
  DEFAULT_PROFILE_THEME,
  PROFILE_ACCENT_OPTIONS,
  PROFILE_BACKGROUND_TEXTURES,
  PROFILE_LAYOUT_OPTIONS,
  coerceProfileTheme,
} from '@/lib/profileThemeOptions';
import { LIL_ANGLER_BADGE, sanitizeUserBadges, type ProfileTheme, type Team } from '@/lib/firestore';
import type { EnvironmentSnapshot } from '@/lib/environmentTypes';
import { SEASON_LABELS, type SeasonKey, type UserTackleStats } from '@/lib/tackleBox';

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

const SEASON_FILTER_ORDER: SeasonKey[] = ['spring', 'summer', 'fall', 'winter'];

type BadgeItem = {
  key: string;
  label: string;
  className: string;
  icon: JSX.Element;
};

const BADGE_BASE_CLASS =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide';
const DEFAULT_BADGE_STYLE = 'border-white/20 bg-white/10 text-white/80';
const BADGE_STYLE_MAP: Record<string, { className: string; label?: string }> = {
  pro: {
    className: 'border-amber-300/60 bg-amber-500/15 text-amber-200',
    label: 'Pro member',
  },
  [LIL_ANGLER_BADGE]: {
    className: 'border-sky-300/50 bg-sky-500/20 text-sky-100',
    label: 'Lil Angler',
  },
};

function formatBadgeLabel(key: string): string {
  const fallback = key
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
  return fallback || 'Badge';
}

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
  isPro?: boolean;
  about?: string;
  profileTheme?: Partial<ProfileTheme> | null;
  age?: number | null;
  badges?: string[];
};

type Catch = {
  id: string;
  imageUrl?: string;
  species?: string;
  weight?: string;
  trophy?: boolean;
  caption?: string;
  environmentSnapshot?: EnvironmentSnapshot | null;
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
  tackleStats?: UserTackleStats | null;
  teams?: Team[] | null;
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
  tackleStats,
  teams = [],
}: ProfileViewProps) {
  const trophyCatches = useMemo(() => catches.filter((catchItem) => catchItem.trophy), [catches]);
  const standardCatches = useMemo(() => catches.filter((catchItem) => !catchItem.trophy), [catches]);
  const stats = useMemo(
    () => catchSummary ?? summarizeCatchMetrics(catches),
    [catchSummary, catches],
  );
  const environmentSummary = stats.environment;

  const avatarSrc = profile?.photoURL || '/logo.svg';
  const headerSrc = profile?.header || avatarSrc;
  const displayName = profile?.displayName || profile?.username || 'Angler';
  const username = profile?.username;
  const usernameDisplay = useMemo(() => {
    if (!username) return null;
    return profile?.isTester ? `@hookd_${username}` : `@${username}`;
  }, [profile?.isTester, username]);
  const isProMember = useMemo(() => Boolean(profile?.isPro), [profile?.isPro]);
  const teamAffiliations = useMemo(
    () => teams.filter((team) => Boolean(team?.id && team?.name)),
    [teams],
  );
  const badgeItems = useMemo<BadgeItem[]>(() => {
    const items: BadgeItem[] = [];
    const seen = new Set<string>();

    if (isProMember) {
      const { className, label } = BADGE_STYLE_MAP.pro;
      items.push({
        key: 'pro',
        label: label ?? 'Pro member',
        className,
        icon: <Sparkles aria-hidden className="h-3.5 w-3.5" />,
      });
      seen.add('pro');
    }

    const additionalBadges = sanitizeUserBadges(profile?.badges);
    for (const badge of additionalBadges) {
      if (seen.has(badge)) continue;

      const styleConfig = BADGE_STYLE_MAP[badge];
      const className = styleConfig?.className ?? DEFAULT_BADGE_STYLE;
      const label = styleConfig?.label ?? formatBadgeLabel(badge);
      let icon: JSX.Element;

      if (badge === LIL_ANGLER_BADGE) {
        icon = <Fish aria-hidden className="h-3.5 w-3.5" />;
      } else if (badge === 'pro') {
        icon = <Sparkles aria-hidden className="h-3.5 w-3.5" />;
      } else {
        icon = <Medal aria-hidden className="h-3.5 w-3.5" />;
      }

      items.push({
        key: badge,
        label,
        className,
        icon,
      });
      seen.add(badge);
    }

    return items;
  }, [isProMember, profile?.badges]);

  const theme = useMemo(() => {
    try {
      return coerceProfileTheme(profile?.profileTheme ?? null, DEFAULT_PROFILE_THEME);
    } catch {
      return DEFAULT_PROFILE_THEME;
    }
  }, [profile]);

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

  const formatTemperature = useCallback((value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return '—';
    return `${Math.round(value)}°F`;
  }, []);

  const formatBandLabel = useCallback((value: string | null | undefined) => {
    if (!value) return '—';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }, []);

  const formatPressure = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '—';
      if (value === 'mid') return 'Steady';
      return formatBandLabel(value);
    },
    [formatBandLabel],
  );

  const formatWind = useCallback((wind: CatchEnvironmentSummary['prevailingWind']) => {
      if (!wind) return '—';
      const direction = wind.direction ?? (wind.degrees != null ? `${Math.round(wind.degrees)}°` : null);
      const speed = wind.speedMph != null && Number.isFinite(wind.speedMph)
        ? `${Math.round(wind.speedMph)} mph`
        : null;
      if (direction && speed) return `${direction} · ${speed}`;
      return direction ?? speed ?? '—';
  }, []);

  const environmentMetrics = useMemo(() => {
    if (!environmentSummary) return [];
    return [
      {
        key: 'weather',
        label: 'Typical Weather',
        value: environmentSummary.typicalWeather?.description ?? '—',
      },
      {
        key: 'air',
        label: 'Avg Air Temp',
        value: formatTemperature(environmentSummary.averageAirTempF),
      },
      {
        key: 'water',
        label: 'Avg Water Temp',
        value: formatTemperature(environmentSummary.averageWaterTempF),
      },
      {
        key: 'pressure',
        label: 'Typical Pressure',
        value: formatPressure(environmentSummary.typicalPressure),
      },
      {
        key: 'moon',
        label: 'Typical Moon Phase',
        value: formatBandLabel(environmentSummary.typicalMoonPhase),
      },
      {
        key: 'time',
        label: 'Prime Time',
        value: formatBandLabel(environmentSummary.typicalTimeOfDay),
      },
      {
        key: 'wind',
        label: 'Prevailing Wind',
        value: formatWind(environmentSummary.prevailingWind),
      },
    ];
  }, [environmentSummary, formatBandLabel, formatPressure, formatTemperature, formatWind]);

  const hasEnvironmentData = Boolean(environmentSummary && environmentSummary.sampleSize > 0);

  const aboutContent = profile?.about?.trim();
  const canOpenLogbook = useMemo(
    () => Boolean(isOwner && isProMember && onOpenLogbook),
    [isOwner, isProMember, onOpenLogbook],
  );
  const canOpenTeams = useMemo(() => Boolean(isOwner && isProMember), [isOwner, isProMember]);

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
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">{displayName}</h1>
                  {badgeItems.length > 0 && (
                    <ul className="flex flex-wrap items-center gap-2" aria-label="Profile badges">
                      {badgeItems.map((badge) => (
                        <li key={badge.key}>
                          <span className={clsx(BADGE_BASE_CLASS, badge.className)}>
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
                {teamAffiliations.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <span className="uppercase tracking-[0.2em] text-white/40">Teams</span>
                    {teamAffiliations.map((team) => (
                      <Link
                        key={team.id}
                        href={`/teams/${team.id}`}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-brand-300 hover:text-brand-200"
                      >
                        {team.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
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
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canOpenLogbook}
                  >
                    <BookOpen className="h-4 w-4" />
                    Manage Logbook
                  </button>
                )}
                {canOpenTeams && (
                  <Link
                    href="/teams"
                    prefetch={false}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--profile-accent-ring)]"
                  >
                    <Users className="h-4 w-4" />
                    Manage Team
                  </Link>
                )}
                {isOwner && !isProMember && (
                  <span className="text-xs font-medium uppercase tracking-wide text-amber-300">
                    Go Pro to unlock teams and the logbook
                  </span>
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

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white/80">Catch Insights</p>
              <p className="text-xs text-white/50">Auto-logged conditions from your catches</p>
            </div>
            <span className="rounded-full border border-amber-300/60 bg-amber-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
              Pro
            </span>
          </div>
          {isProMember ? (
            hasEnvironmentData ? (
              <>
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {environmentMetrics.map((metric) => (
                    <div
                      key={metric.key}
                      className="rounded-xl border border-white/10 bg-black/30 p-3"
                    >
                      <dt className="text-xs uppercase tracking-wide text-white/50">{metric.label}</dt>
                      <dd className="mt-1 text-sm font-medium text-white/90">{metric.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[11px] text-white/40">
                  Based on {environmentSummary?.sampleSize ?? 0} logged catches with location data.
                </p>
              </>
            ) : (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white/60">
                Catch insights will appear after you post catches with location and timestamp info.
              </p>
            )
          ) : (
            <div className="mt-4 space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-amber-100">
              <p className="text-sm font-medium">Unlock detailed weather insights with Hook&apos;d Pro.</p>
              <p className="text-xs text-amber-50/80">
                Weather, temps, pressure, moon phase, and wind are captured automatically every time you log a catch.
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfidenceBaitsWidget stats={tackleStats ?? null} isProMember={isProMember} />

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

type ConfidenceBaitsWidgetProps = {
  stats: UserTackleStats | null | undefined;
  isProMember: boolean;
};

function ConfidenceBaitsWidget({ stats, isProMember }: ConfidenceBaitsWidgetProps) {
  const [speciesFilter, setSpeciesFilter] = useState<string>('all');
  const [seasonFilter, setSeasonFilter] = useState<SeasonKey | 'all'>('all');

  const speciesOptions = useMemo(() => {
    if (!stats?.entries?.length) return [] as string[];
    const values = new Set<string>();
    stats.entries.forEach((entry) => {
      Object.keys(entry.speciesCounts ?? {}).forEach((key) => {
        const normalized = key.trim();
        if (normalized) {
          values.add(normalized);
        }
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [stats]);

  const seasonOptions = useMemo(() => {
    if (!stats?.entries?.length) return [] as SeasonKey[];
    const values = new Set<SeasonKey>();
    stats.entries.forEach((entry) => {
      const counts = entry.seasonCounts ?? {};
      SEASON_FILTER_ORDER.forEach((key) => {
        if ((counts[key] ?? 0) > 0) {
          values.add(key);
        }
      });
    });
    return SEASON_FILTER_ORDER.filter((key) => values.has(key));
  }, [stats]);

  const resolvedSpeciesFilter = useMemo(() => {
    if (speciesFilter === 'all') return 'all';
    return speciesOptions.includes(speciesFilter) ? speciesFilter : 'all';
  }, [speciesFilter, speciesOptions]);

  const resolvedSeasonFilter = useMemo<SeasonKey | 'all'>(() => {
    if (seasonFilter === 'all') return 'all';
    return seasonOptions.includes(seasonFilter) ? seasonFilter : 'all';
  }, [seasonFilter, seasonOptions]);

  const filteredEntries = useMemo(() => {
    if (!stats?.entries?.length) return [] as typeof stats.entries;
    return stats.entries
      .filter((entry) => {
        if (resolvedSpeciesFilter !== 'all') {
          const counts = entry.speciesCounts ?? {};
          if ((counts[resolvedSpeciesFilter] ?? 0) <= 0) {
            return false;
          }
        }
        if (resolvedSeasonFilter !== 'all') {
          const counts = entry.seasonCounts ?? {};
          if ((counts[resolvedSeasonFilter] ?? 0) <= 0) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (b.catchRate !== a.catchRate) {
          return b.catchRate - a.catchRate;
        }
        if (b.trophyRate !== a.trophyRate) {
          return b.trophyRate - a.trophyRate;
        }
        return (b.totalCatches ?? 0) - (a.totalCatches ?? 0);
      });
  }, [stats, resolvedSpeciesFilter, resolvedSeasonFilter]);

  const hasStats = Boolean(stats?.entries?.length);
  const totalSamples = stats?.totalCatches ?? 0;

  const resolveTopSpecies = useCallback((counts?: Record<string, number>) => {
    if (!counts) return null;
    let bestKey: string | null = null;
    let bestValue = 0;
    Object.entries(counts).forEach(([key, value]) => {
      if (!key) return;
      if (value > bestValue) {
        bestValue = value;
        bestKey = key;
      }
    });
    return bestKey;
  }, []);

  const resolveTopSeason = useCallback((counts?: Record<SeasonKey, number>) => {
    if (!counts) return null;
    let bestKey: SeasonKey | null = null;
    let bestValue = 0;
    SEASON_FILTER_ORDER.forEach((key) => {
      const value = counts[key] ?? 0;
      if (value > bestValue) {
        bestValue = value;
        bestKey = key;
      }
    });
    return bestKey;
  }, []);

  const formatPercent = useCallback((value: number) => {
    if (!Number.isFinite(value)) return '0%';
    return `${Math.round(value * 1000) / 10}%`;
  }, []);

  return (
    <div className="card mt-8 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
            <Sparkles aria-hidden className="h-5 w-5 text-[var(--profile-accent-strong)]" />
            Confidence Baits
          </h2>
          <p className="text-xs text-white/50">Top-performing tackle from your logged catches.</p>
        </div>
        <span className="rounded-full border border-amber-300/60 bg-amber-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          Pro
        </span>
      </div>
      {isProMember ? (
        hasStats ? (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3 text-xs text-white/60">
              {speciesOptions.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-white/40">Species filter</span>
                  <select
                    className="input bg-black/40 text-xs"
                    value={resolvedSpeciesFilter}
                    onChange={(event) => setSpeciesFilter(event.target.value)}
                  >
                    <option value="all">All species</option>
                    {speciesOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {seasonOptions.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-white/40">Season filter</span>
                  <select
                    className="input bg-black/40 text-xs"
                    value={resolvedSeasonFilter}
                    onChange={(event) => setSeasonFilter(event.target.value as SeasonKey | 'all')}
                  >
                    <option value="all">All seasons</option>
                    {seasonOptions.map((option) => (
                      <option key={option} value={option}>
                        {SEASON_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(resolvedSpeciesFilter !== 'all' || resolvedSeasonFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSpeciesFilter('all');
                    setSeasonFilter('all');
                  }}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:text-white"
                >
                  Clear filters
                </button>
              )}
            </div>
            {filteredEntries.length ? (
              <div className="mt-4 space-y-3">
                {filteredEntries.slice(0, 5).map((entry) => {
                  const activeSpecies = resolvedSpeciesFilter !== 'all'
                    ? resolvedSpeciesFilter
                    : resolveTopSpecies(entry.speciesCounts);
                  const activeSeasonKey = resolvedSeasonFilter !== 'all'
                    ? resolvedSeasonFilter
                    : resolveTopSeason(entry.seasonCounts);
                  const activeSeasonLabel = activeSeasonKey ? SEASON_LABELS[activeSeasonKey] : null;
                  const secondaryLine = [entry.color, entry.rigging]
                    .filter((part) => part && part.trim().length > 0)
                    .join(' • ');
                  const lastCaughtDate = entry.lastCaughtAt && typeof entry.lastCaughtAt.toDate === 'function'
                    ? entry.lastCaughtAt.toDate()
                    : null;
                  const lastCaughtLabel = lastCaughtDate
                    ? lastCaughtDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : '—';

                  return (
                    <div key={entry.key} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{entry.lureType}</p>
                          <p className="text-xs text-white/60">{secondaryLine || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-semibold text-white">{formatPercent(entry.catchRate)}</p>
                          <p className="text-[10px] uppercase tracking-wide text-white/40">Catch share</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-xs text-white/60 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-white/40">Trophy ratio</p>
                          <p className="text-sm text-white">{formatPercent(entry.trophyRate)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-white/40">Sample size</p>
                          <p className="text-sm text-white">{entry.totalCatches}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-white/40">Last logged</p>
                          <p className="text-sm text-white">{lastCaughtLabel}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-white/60">
                        {activeSpecies && (
                          <span className="rounded-full bg-white/10 px-2 py-1">{activeSpecies}</span>
                        )}
                        {activeSeasonLabel && (
                          <span className="rounded-full bg-white/10 px-2 py-1">{activeSeasonLabel}</span>
                        )}
                      </div>
                      {entry.notesSample && (
                        <p className="mt-3 text-xs italic text-white/60">“{entry.notesSample}”</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/60">
                No tackle matches the current filters. Try resetting them to see all of your go-to baits.
              </p>
            )}
            <p className="mt-4 text-[11px] text-white/40">
              Based on {totalSamples} logged catches with tackle details.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/60">
            Confidence baits will appear after you log catches with tackle information.
          </p>
        )
      ) : (
        <div className="mt-4 space-y-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-amber-100">
          <p className="text-sm font-medium">Unlock tackle analytics with Hook&apos;d Pro.</p>
          <p className="text-xs text-amber-50/80">
            Track catch rates by lure, color, and presentation to build unstoppable confidence baits.
          </p>
        </div>
      )}
    </div>
  );
}
