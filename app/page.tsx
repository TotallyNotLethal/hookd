'use client';
import { auth } from "@/lib/firebaseClient";
import NavBar from "@/components/NavBar";
import Image from "next/image";
import Link from "next/link";
import LoginButton from "@/components/auth/LoginButton";
import PostCard from "@/components/PostCard";
import ConditionsWidget from "@/components/ConditionsWidget";
import dynamic from "next/dynamic";
import {
  getChallengeCatches,
  subscribeToActiveTournaments,
  subscribeToChallengeCatches,
  subscribeToFeedCatches,
  subscribeToSpeciesTrendingInsights,
  subscribeToTournamentLeaderboardByLength,
  subscribeToTournamentLeaderboardByWeight,
  subscribeToNewestUser,
  subscribeToUser,
} from "@/lib/firestore";
import type {
  HookdUser,
  SpeciesTrendingInsight,
  Tournament,
  TournamentLeaderboardEntry,
} from "@/lib/firestore";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuthState } from "react-firebase-hooks/auth";

const TrendingExplorer = dynamic(() => import("@/components/TrendingExplorer"), {
  loading: () => (
    <section className="container py-16">
      <div className="card p-6 text-white/60">Loading trends…</div>
    </section>
  ),
});

const PostDetailModal = dynamic(() => import("@/app/feed/PostDetailModal"), {
  ssr: false,
});



export default function Page() {
  const [challengePosts, setChallengePosts] = useState<any[]>([]);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [feedPageSize, setFeedPageSize] = useState(3);
  const [active, setActive] = useState<any | null>(null);
  const [activeCollection, setActiveCollection] = useState<'recent' | 'challenge' | null>(null);
  const [weightLeaders, setWeightLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [lengthLeaders, setLengthLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [speciesInsights, setSpeciesInsights] = useState<SpeciesTrendingInsight[]>([]);
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [newestAngler, setNewestAngler] = useState<HookdUser | null>(null);
  const [user] = useAuthState(auth);
  const [hasViewedFeed, setHasViewedFeed] = useState(false);
  const [hasViewedChallenges, setHasViewedChallenges] = useState(false);
  const [hasViewedLeaderboards, setHasViewedLeaderboards] = useState(false);
  const [hasViewedTrending, setHasViewedTrending] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [conditionsReady, setConditionsReady] = useState(false);

  const visibleFeed = useMemo(
    () => feedItems.slice(0, Math.max(1, feedPageSize)),
    [feedItems, feedPageSize],
  );
  const hasMoreFeed = feedItems.length > visibleFeed.length;

  const handleLoadMoreFeed = useCallback(() => {
    setFeedPageSize((size) => size + 3);
  }, []);

  const feedSectionRef = useRef<HTMLElement | null>(null);
  const challengeSectionRef = useRef<HTMLElement | null>(null);
  const leaderboardSectionRef = useRef<HTMLElement | null>(null);
  const trendingSectionRef = useRef<HTMLElement | null>(null);

  const openFromCollection = useCallback(
    (post: any, source: 'recent' | 'challenge') => {
      setActive(post);
      setActiveCollection(source);
    },
    [],
  );

  const handleOpenRecent = useCallback(
    (post: any) => openFromCollection(post, 'recent'),
    [openFromCollection],
  );

  const handleOpenChallenge = useCallback(
    (post: any) => openFromCollection(post, 'challenge'),
    [openFromCollection],
  );

  const handleCloseModal = useCallback(() => {
    setActive(null);
    setActiveCollection(null);
  }, []);

  const activeCollectionItems = useMemo(() => {
    if (activeCollection === 'recent') return visibleFeed;
    if (activeCollection === 'challenge') return challengePosts;
    return [];
  }, [activeCollection, challengePosts, visibleFeed]);

  const activeIndex = useMemo(() => {
    if (!active) return -1;
    return activeCollectionItems.findIndex((item) => item.id === active.id);
  }, [active, activeCollectionItems]);

  const previousPost = useMemo(
    () => (activeIndex > 0 ? activeCollectionItems[activeIndex - 1] : null),
    [activeCollectionItems, activeIndex],
  );

  const nextPost = useMemo(
    () =>
      activeIndex >= 0 && activeIndex < activeCollectionItems.length - 1
        ? activeCollectionItems[activeIndex + 1]
        : null,
    [activeCollectionItems, activeIndex],
  );
  const defer = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  }, []);
  const [fallbackConditionsLocation, setFallbackConditionsLocation] = useState<
    | {
        name: string;
        latitude: number;
        longitude: number;
        timezone?: string;
      }
    | null
  >(null);
  const [locationPermissionError, setLocationPermissionError] = useState<string | null>(null);
  const topWeightLeaders = useMemo(
    () => weightLeaders.filter((entry) => (entry.weightScore ?? 0) > 0).slice(0, 3),
    [weightLeaders],
  );
  const topLengthLeaders = useMemo(
    () => lengthLeaders.filter((entry) => (entry.lengthScore ?? 0) > 0).slice(0, 3),
    [lengthLeaders],
  );
  const orbitLinks = useMemo(
    () => (
      [
        { href: '/feed', label: 'Feed', angle: -90, delay: 0 },
        { href: '/groups', label: 'Crews', angle: -30, delay: 0.5 },
        { href: '/tools', label: 'Tools', angle: 30, delay: 1.2 },
        { href: '/feed?compose=1', label: 'Share', angle: 90, delay: 1.8 },
        { href: '/logbook', label: 'Logbook', angle: 150, delay: 2.4 },
        { href: '/map', label: 'Map', angle: 210, delay: 3 },
      ] satisfies Array<{ href: string; label: string; angle: number; delay: number }>
    ),
    [],
  );
  const isProModerator = Boolean(profile?.isPro);
  const blockedSet = useMemo(() => {
    const ids = new Set<string>();
    const blocked = Array.isArray(profile?.blockedUserIds) ? profile.blockedUserIds : [];
    const blockedBy = Array.isArray(profile?.blockedByUserIds) ? profile.blockedByUserIds : [];

    for (const value of blocked) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) ids.add(trimmed);
      }
    }

    for (const value of blockedBy) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) ids.add(trimmed);
      }
    }

    return ids;
  }, [profile]);

  useEffect(() => {
    const targets: Array<{ ref: RefObject<HTMLElement | null>; setter: (value: boolean) => void }>
      = [
        { ref: feedSectionRef, setter: setHasViewedFeed },
        { ref: challengeSectionRef, setter: setHasViewedChallenges },
        { ref: leaderboardSectionRef, setter: setHasViewedLeaderboards },
        { ref: trendingSectionRef, setter: setHasViewedTrending },
      ];

    const observers = targets.map(({ ref, setter }) => {
      const element = ref.current;
      if (!element) return null;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setter(true);
            observer.disconnect();
          }
        },
        { rootMargin: "200px 0px" },
      );

      observer.observe(element);
      return observer;
    });

    return () => {
      observers.forEach((observer) => observer?.disconnect());
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const updateVisibility = () => setIsDocumentVisible(!document.hidden);
    updateVisibility();

    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || hasUserInteracted) return undefined;

    const markInteracted = () => setHasUserInteracted(true);
    const opts: AddEventListenerOptions = { once: true, passive: true };

    window.addEventListener("pointerdown", markInteracted, opts);
    window.addEventListener("touchstart", markInteracted, opts);
    window.addEventListener("keydown", markInteracted, { once: true });
    window.addEventListener("wheel", markInteracted, { once: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", markInteracted, opts);
      window.removeEventListener("touchstart", markInteracted, opts);
      window.removeEventListener("keydown", markInteracted);
      window.removeEventListener("wheel", markInteracted);
    };
  }, [hasUserInteracted]);

  useEffect(() => {
    if (typeof window === "undefined" || conditionsReady) {
      return undefined;
    }

    const idleCallback = (window as typeof window & { requestIdleCallback?: any }).requestIdleCallback;
    const idleHandle: number = idleCallback
      ? idleCallback(() => setConditionsReady(true), { timeout: 3500 })
      : window.setTimeout(() => setConditionsReady(true), 3500);

    return () => {
      if (idleCallback && typeof (window as any).cancelIdleCallback === "function") {
        (window as any).cancelIdleCallback(idleHandle);
      } else {
        clearTimeout(idleHandle);
      }
    };
  }, [conditionsReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !conditionsReady) {
      return;
    }

    const storageKey = "hookd:last-known-location";

    try {
      const cached = window.localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const latitude = Number(parsed?.latitude);
        const longitude = Number(parsed?.longitude);
        const name = typeof parsed?.name === "string" ? parsed.name : null;
        const timezone = typeof parsed?.timezone === "string" ? parsed.timezone : undefined;
        if (name && Number.isFinite(latitude) && Number.isFinite(longitude)) {
          defer(() => {
            setFallbackConditionsLocation({
              name,
              latitude,
              longitude,
              timezone,
            });
          });
        }
      }
    } catch (error) {
      console.warn("Unable to load cached location", error);
    }
  }, [conditionsReady, defer]);

  const handleEnableConditions = useCallback(() => {
    setConditionsReady(true);
  }, []);

  const handleConditionsLocationResolved = useCallback(
    (payload: { name: string; latitude: number; longitude: number; timezone?: string }) => {
      setFallbackConditionsLocation(payload);
      setLocationPermissionError(null);

      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(
          "hookd:last-known-location",
          JSON.stringify({
            name: payload.name,
            latitude: payload.latitude,
            longitude: payload.longitude,
            timezone: payload.timezone,
          }),
        );
      } catch (error) {
        console.warn("Unable to persist location fallback", error);
      }
    },
    [],
  );

  const handleConditionsPermissionDenied = useCallback(() => {
    setLocationPermissionError(
      "We need access to your location to show nearby bite conditions. Update your browser permissions and try again.",
    );
  }, []);

  const filterPosts = useCallback(
    (posts: any[]) => {
      if (!Array.isArray(posts) || posts.length === 0 || blockedSet.size === 0) {
        return posts;
      }

      return posts.filter((post) => {
        const ownerUid = typeof post?.uid === "string"
          ? post.uid
          : typeof post?.userId === "string"
            ? post.userId
            : null;
        if (!ownerUid) return true;
        return !blockedSet.has(ownerUid);
      });
    },
    [blockedSet],
  );


  useEffect(() => {
    if (!hasViewedChallenges || !isDocumentVisible || !hasUserInteracted) return undefined;

    let isMounted = true;

    (async () => {
      try {
        const initialPosts = await getChallengeCatches();
        if (!isMounted) return;
        setChallengePosts(filterPosts(initialPosts));
      } catch (error) {
        console.error("Failed to load challenge catches", error);
      }
    })();

    const unsubscribe = subscribeToChallengeCatches((posts) => {
      if (isMounted) {
        setChallengePosts(filterPosts(posts));
      }
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [filterPosts, hasUserInteracted, hasViewedChallenges, isDocumentVisible]);

  useEffect(() => {
    if (!hasViewedFeed || !isDocumentVisible) return undefined;

    const unsubscribe = subscribeToFeedCatches(
      (posts) => {
        const filtered = filterPosts(posts);
        setFeedItems(filtered);
        setFeedPageSize((size) => Math.max(3, Math.min(size, Math.max(filtered.length, 3))));
      },
      { limit: 15 },
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [filterPosts, hasViewedFeed, isDocumentVisible]);

  useEffect(() => {
    if (!hasViewedLeaderboards || !hasUserInteracted || !isDocumentVisible) return undefined;

    const unsubscribeWeight = subscribeToTournamentLeaderboardByWeight(7, (entries) => {
      setWeightLeaders(entries);
    });
    const unsubscribeLength = subscribeToTournamentLeaderboardByLength(7, (entries) => {
      setLengthLeaders(entries);
    });

    return () => {
      if (typeof unsubscribeWeight === 'function') unsubscribeWeight();
      if (typeof unsubscribeLength === 'function') unsubscribeLength();
    };
  }, [hasUserInteracted, hasViewedLeaderboards, isDocumentVisible]);

  useEffect(() => {
    if (!hasViewedLeaderboards || !hasUserInteracted || !isDocumentVisible) return undefined;

    const unsubscribe = subscribeToActiveTournaments((events) => {
      setActiveTournaments(events);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [hasUserInteracted, hasViewedLeaderboards, isDocumentVisible]);

  useEffect(() => {
    if (!hasViewedTrending || !hasUserInteracted || !isDocumentVisible) return undefined;

    const unsubscribe = subscribeToSpeciesTrendingInsights((insights) => {
      setSpeciesInsights(insights);
    }, {
      weeks: 6,
      maxSamples: 300,
      speciesLimit: 5,
      minBaitSamples: 3,
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [hasUserInteracted, hasViewedTrending, isDocumentVisible]);

  useEffect(() => {
    const unsubscribe = subscribeToNewestUser((user) => {
      setNewestAngler(user);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      defer(() => setProfile(null));
      return undefined;
    }

    const unsubscribe = subscribeToUser(user.uid, (data) => {
      setProfile(data);
    });

    return () => {
      unsubscribe();
    };
  }, [defer, user?.uid]);




  return (
    <main>
      <NavBar />

      {newestAngler ? (
        <div className="bg-brand-900/60 border-b border-white/10">
          <div className="container py-3 text-center text-sm md:text-base">
            <span className="text-white/90">Welcome to our newest angler: </span>
            <Link
              href={`/profile/${newestAngler.uid}`}
              className="font-semibold text-brand-200 hover:text-brand-100 transition"
            >
              {newestAngler.displayName || 'A New Angler'}
            </Link>
            <span className="text-white/90">!</span>
          </div>
        </div>
      ) : null}

      {/* --- HERO SECTION --- */}
      <section className="launch-stage relative overflow-hidden pt-nav pb-12">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/sample/catches/bass1.jpg"
            alt="Angler proudly holding a largemouth bass at sunset"
            fill
            className="object-cover opacity-25 brightness-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#061429]/60 via-[#040d1b]/90 to-[#030914]" />
        </div>
        <div className="launch-grid absolute inset-0 -z-[5]" />
        <div className="launch-beams" />
        <div className="fishing-lines" />

        <div className="container relative z-10 grid min-h-[calc(100vh-var(--nav-height)-1rem)] items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="relative space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-brand-100 shadow-soft shadow-brand-500/20">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-300 shadow-[0_0_0_10px_rgba(56,189,248,0.25)]" />
              Hook&apos;d launch console
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
                Cast off into the Hook&apos;d galaxy.
              </h1>
              <p className="max-w-2xl text-lg text-white/85">
                Spin the neon helm, orbit the outer bait rings, and jump straight into the spots anglers hit most—map, logbook, crews, tools, feed, and sharing your latest catch.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <Link
                href="/feed"
                className="btn-primary px-6 py-3 text-base md:text-lg shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                Launch Feed
              </Link>
              <Link
                href="/map"
                className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-base md:text-lg transition hover:border-brand-300/40 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                Scout the Map
              </Link>
              {user ? (
                <Link
                  href="/feed?compose=1"
                  className="rounded-xl border border-brand-300/50 bg-brand-300/10 px-6 py-3 text-base md:text-lg font-semibold text-brand-100 transition hover:border-brand-200 hover:bg-brand-200/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  Drop a Catch
                </Link>
              ) : (
                <LoginButton className="rounded-xl border border-white/20 px-6 py-3 text-base md:text-lg transition hover:border-brand-300/40 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">
                  Sign In
                </LoginButton>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="launch-cta-card relative overflow-hidden rounded-2xl p-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.12),transparent_35%),radial-gradient(circle_at_70%_80%,rgba(14,165,233,0.08),transparent_40%)]" />
                <div className="relative flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-300/10 text-brand-100 ring-1 ring-brand-300/40">
                    🧭
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">Quick jump</p>
                    <p className="text-white">Map, logbook, tournaments, and tools at your fingertips.</p>
                  </div>
                </div>
              </div>
              <div className="launch-cta-card relative overflow-hidden rounded-2xl p-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_40%,rgba(56,189,248,0.1),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.07),transparent_40%)]" />
                <div className="relative flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-400/15 text-brand-100 ring-1 ring-brand-300/40">
                    ⚡
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">Live vibe</p>
                    <p className="text-white">Instant access to conditions, trending species, and challenges.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-24 -z-10 bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.3),transparent_45%),radial-gradient(circle_at_30%_10%,rgba(14,165,233,0.2),transparent_40%)] blur-3xl" />
            <div className="angler-bubbles" aria-hidden />
            <div className="orb-shell mx-auto shadow-[0_0_140px_rgba(56,189,248,0.25)]">
              <div className="orb-core">
                <span className="text-sm uppercase tracking-[0.3em] text-brand-100/80">Hook&apos;d</span>
                <p className="text-2xl font-semibold">Launchpad</p>
                <p className="text-sm text-white/70">Tap a sector to dive in.</p>
              </div>

              <div className="orb-track" aria-label="Hook&apos;d launch destinations">
                {orbitLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="orb-node"
                    aria-label={`Open ${link.label}`}
                    style={{
                      '--orbit-angle': `${link.angle}deg`,
                      '--orbit-radius': '44%',
                      '--orbit-bob-delay': `${link.delay}s`,
                    } as CSSProperties}
                  >
                    <span className="orb-chip">{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {locationPermissionError ? (
                <div className="sm:col-span-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {locationPermissionError}
                </div>
              ) : null}
              {conditionsReady ? (
                <ConditionsWidget
                  className="sm:col-span-2"
                  fallbackLocation={fallbackConditionsLocation ?? undefined}
                  onLocationResolved={handleConditionsLocationResolved}
                  onLocationPermissionDenied={handleConditionsPermissionDenied}
                />
              ) : (
                <div className="sm:col-span-2 card p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-brand-200/80">Local conditions</p>
                      <h3 className="text-lg font-semibold text-white">Check what&apos;s biting</h3>
                    </div>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/80">Lightweight preview</span>
                  </div>
                  <p className="text-sm text-white/70">
                    Tap below to load nearby bite forecasts when you&apos;re ready, or we&apos;ll grab them once
                    things are idle.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-primary px-4 py-2 text-sm"
                      onClick={handleEnableConditions}
                    >
                      Check local conditions
                    </button>
                    <span className="text-xs text-white/50">Keeps the hero snappy in the app container.</span>
                  </div>
                </div>
              )}
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Trending lakes</h3>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/60">Live</span>
                </div>
                <ul className="mt-2 space-y-2 text-sm text-white/70">
                  <li>Sippo Lake · Ohio</li>
                  <li>Nimisila Reservoir · Ohio</li>
                  <li>Tuscarawas River · Ohio</li>
                </ul>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Top species</h3>
                  <span className="rounded-full bg-brand-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-brand-100">Rising</span>
                </div>
                <ul className="mt-2 space-y-2 text-sm text-white/70">
                  <li>Largemouth Bass</li>
                  <li>Northern Pike</li>
                  <li>Bowfin</li>
                </ul>
              </div>
              <div className="card p-4 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">Weekly challenge</p>
                    <h3 className="text-lg font-semibold text-white">#HookdChallenge</h3>
                  </div>
                  <Link
                    href="/feed?compose=1"
                    className="rounded-full border border-brand-200/50 px-4 py-2 text-sm text-brand-100 hover:bg-brand-300/10"
                  >
                    Submit a catch
                  </Link>
                </div>
                <p className="mt-2 text-white/80 text-sm">
                  Catch a bass over 3lb using paddle tails and share it to the feed with the tag above.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={feedSectionRef} className="container py-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Best of the feed</p>
            <h2 className="text-2xl font-semibold text-white">Fresh catches from the community</h2>
          </div>
          <Link href="/feed" className="text-brand-300 hover:text-brand-200 text-sm md:text-base">
            View full feed →
          </Link>
        </div>

        {visibleFeed.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleFeed.map((post) => (
              <PostCard key={post.id} post={post} onOpen={handleOpenRecent} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 p-10 text-center text-white/70">
            <p>No catches yet — check out the feed to see the latest action.</p>
            <Link href="/feed" className="btn-primary">
              Explore the feed
            </Link>
          </div>
        )}
        {hasMoreFeed ? (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              className="btn-primary px-6"
              onClick={handleLoadMoreFeed}
            >
              Load more catches
            </button>
          </div>
        ) : null}
      </section>

      <section ref={trendingSectionRef}>
        {hasViewedTrending ? (
          <TrendingExplorer
            activeTournaments={activeTournaments}
            weightLeaders={weightLeaders}
            lengthLeaders={lengthLeaders}
            speciesInsights={speciesInsights}
            isProModerator={isProModerator}
          />
        ) : (
          <div className="container py-16">
            <div className="card p-6 text-white/60">Scroll to load trends</div>
          </div>
        )}
      </section>

      {/* --- WEEKLY CHALLENGE GALLERY --- */}
      <section ref={challengeSectionRef} className="container py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-brand-300">
              🎣 Featured #HookdChallenge Catches
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {challengePosts.length > 0 ? (
                challengePosts.map((p) => (
                  <PostCard key={p.id} post={p} onOpen={handleOpenChallenge} />
                ))
              ) : (
                <p className="text-white/60">
                  No challenge posts yet — be the first to tag your catch with{" "}
                  <span className="text-brand-300">#HookdChallenge</span>!
                </p>
              )}
            </div>
          </div>
          <aside
            ref={leaderboardSectionRef}
            className="glass rounded-3xl border border-white/10 p-6 self-start"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-brand-200">
                Live Tournament Leaderboards
              </h3>
              {isProModerator && (
                <span className="rounded-full border border-brand-400/60 px-3 py-1 text-xs text-brand-200">
                  Pro moderator
                </span>
              )}
            </div>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-white">Heaviest verified catches</h4>
                {topWeightLeaders.length > 0 ? (
                  <ol className="mt-3 space-y-3">
                    {topWeightLeaders.map((entry, index) => {
                      const isKilogram = entry.measurementUnit?.weight === 'kg';
                      const fallbackWeight = isKilogram
                        ? entry.weightValue ?? ((entry.weightScore ?? 0) * 0.45359237)
                        : entry.weightScore ?? 0;
                      const displayWeight =
                        entry.weightDisplay && entry.weightDisplay.length > 0
                          ? entry.weightDisplay
                          : `${fallbackWeight.toFixed(2)} ${isKilogram ? 'kg' : 'lb'}`;

                      return (
                        <li key={entry.id} className="card p-4 flex items-center gap-4">
                          <span className="text-2xl font-semibold text-brand-300 w-6">
                            {index + 1}.
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-white">
                              {entry.userDisplayName || 'Angler'}
                            </p>
                            <p className="text-xs text-white/60">
                              {displayWeight}
                              {entry.tournamentTitle ? ` · ${entry.tournamentTitle}` : null}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-white/60">
                    No verified weights have been posted yet.
                  </p>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Longest verified catches</h4>
                {topLengthLeaders.length > 0 ? (
                  <ol className="mt-3 space-y-3">
                    {topLengthLeaders.map((entry, index) => {
                      const isCentimeter = entry.measurementUnit?.length === 'cm';
                      const fallbackLength = isCentimeter
                        ? entry.lengthValue ?? ((entry.lengthScore ?? 0) * 2.54)
                        : entry.lengthScore ?? 0;
                      const displayLength =
                        entry.lengthDisplay && entry.lengthDisplay.length > 0
                          ? entry.lengthDisplay
                          : `${fallbackLength.toFixed(2)} ${isCentimeter ? 'cm' : 'in'}`;

                      return (
                        <li key={entry.id} className="card p-4 flex items-center gap-4">
                          <span className="text-2xl font-semibold text-brand-300 w-6">
                            {index + 1}.
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-white">
                              {entry.userDisplayName || 'Angler'}
                            </p>
                            <p className="text-xs text-white/60">
                              {displayLength}
                              {entry.tournamentTitle ? ` · ${entry.tournamentTitle}` : null}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-white/60">
                    No verified length entries yet.
                  </p>
                )}
              </div>
            </div>
            {!isProModerator && (
              <p className="mt-4 text-xs text-white/60">
                Tournament creation and moderation tools are reserved for Hook&apos;d Pro moderators.
              </p>
            )}
          </aside>
        </div>
      </section>
      {active && (
        <PostDetailModal
          post={active}
          onClose={handleCloseModal}
          size="wide"
          onNavigatePrevious={previousPost && activeCollection ? () => openFromCollection(previousPost, activeCollection) : undefined}
          onNavigateNext={nextPost && activeCollection ? () => openFromCollection(nextPost, activeCollection) : undefined}
        />
      )}
    </main>
  );
}
