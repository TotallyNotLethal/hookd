'use client';
import { auth } from "@/lib/firebaseClient";
import NavBar from "@/components/NavBar";
import Image from "next/image";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import ConditionsWidget from "@/components/ConditionsWidget";
import TrendingExplorer from "@/components/TrendingExplorer";
import {
  getChallengeCatches,
  subscribeToActiveTournaments,
  subscribeToChallengeCatches,
  subscribeToFeedCatches,
  subscribeToTournamentLeaderboardByLength,
  subscribeToTournamentLeaderboardByWeight,
  subscribeToUser,
} from "@/lib/firestore";
import type { HookdUser, Tournament, TournamentLeaderboardEntry } from "@/lib/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import PostDetailModal from "@/app/feed/PostDetailModal";



export default function Page() {
  const [challengePosts, setChallengePosts] = useState<any[]>([]);
  const [recentCatches, setRecentCatches] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [weightLeaders, setWeightLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [lengthLeaders, setLengthLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [user] = useAuthState(auth);
  const defer = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  }, []);
  const fallbackConditionsLocation = useMemo(
    () => ({
      name: "Canton, OH",
      latitude: 40.7989,
      longitude: -81.3784,
      timezone: "America/New_York",
    }),
    [],
  );
  const topWeightLeaders = useMemo(
    () => weightLeaders.filter((entry) => (entry.weightScore ?? 0) > 0).slice(0, 3),
    [weightLeaders],
  );
  const topLengthLeaders = useMemo(
    () => lengthLeaders.filter((entry) => (entry.lengthScore ?? 0) > 0).slice(0, 3),
    [lengthLeaders],
  );
  const isProModerator = Boolean(profile?.isPro);


  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const initialPosts = await getChallengeCatches();
        if (!isMounted) return;
        setChallengePosts(initialPosts);
      } catch (error) {
        console.error("Failed to load challenge catches", error);
      }
    })();

    const unsubscribe = subscribeToChallengeCatches((posts) => {
      if (isMounted) {
        setChallengePosts(posts);
      }
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToFeedCatches((posts) => {
      setRecentCatches(posts.slice(0, 4));
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribeWeight = subscribeToTournamentLeaderboardByWeight(10, (entries) => {
      setWeightLeaders(entries);
    });
    const unsubscribeLength = subscribeToTournamentLeaderboardByLength(10, (entries) => {
      setLengthLeaders(entries);
    });

    return () => {
      if (typeof unsubscribeWeight === 'function') unsubscribeWeight();
      if (typeof unsubscribeLength === 'function') unsubscribeLength();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToActiveTournaments((events) => {
      setActiveTournaments(events);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
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

      {/* --- HERO SECTION --- */}
      <section className="relative pt-28">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/sample/catches/bass1.jpg"
            alt="Angler proudly holding a largemouth bass at sunset"
            fill
            className="object-cover opacity-30 brightness-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(8,26,45,0.6)] via-[rgba(11,19,33,0.8)] to-[var(--bg)]" />
        </div>

        <div className="container grid lg:grid-cols-2 gap-10 items-center py-16">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl font-semibold leading-tight">
              Join the <span className="text-brand-300">Hook&apos;d</span> community
            </h1>
            <p className="text-white/90 text-lg max-w-xl">
              Share your catches, discover new spots, and level up your fishing game with real-time reports and leaderboards.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/feed"
                className="btn-primary px-6 py-3 text-base md:text-lg shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                Explore Feed
              </Link>
              <Link
                href="/map"
                className="px-6 py-3 text-base md:text-lg rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                View Fishing Map
              </Link>
              {user ? (
                <Link
                  href="/feed?compose=1"
                  className="px-6 py-3 text-base md:text-lg rounded-xl border border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  Share a Catch
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="px-6 py-3 text-base md:text-lg rounded-xl border border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>

          <div className="glass rounded-3xl p-6 border-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ConditionsWidget
                className="sm:col-span-2"
                fallbackLocation={fallbackConditionsLocation}
              />
              <div className="card p-4">
                <h3 className="font-medium mb-2">Trending Lakes</h3>
                <ul className="text-sm text-white/70 space-y-2">
                  <li>Sippo Lake</li>
                  <li>Nimisila Reservoir</li>
                  <li>Tuscarawas River</li>
                </ul>
              </div>
              <div className="card p-4">
                <h3 className="font-medium mb-2">Top Species</h3>
                <ul className="text-sm text-white/70 space-y-2">
                  <li>Largemouth Bass</li>
                  <li>Northern Pike</li>
                  <li>Bowfin</li>
                </ul>
              </div>
              <div className="card p-4 sm:col-span-2">
                <h3 className="font-medium mb-2">This Week&apos;s Challenge</h3>
                <p className="text-white/80 text-sm">
                  Catch a bass over 3lb using paddle tails. Share with
                  <span className="text-brand-300 font-semibold"> #HookdChallenge</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Best of the feed</p>
            <h2 className="text-2xl font-semibold text-white">Fresh catches from the community</h2>
          </div>
          <Link href="/feed" className="text-brand-300 hover:text-brand-200 text-sm md:text-base">
            View full feed →
          </Link>
        </div>

        {recentCatches.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {recentCatches.map((post) => (
              <PostCard key={post.id} post={post} onOpen={setActive} />
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
      </section>

      <TrendingExplorer
        activeTournaments={activeTournaments}
        weightLeaders={weightLeaders}
        lengthLeaders={lengthLeaders}
        isProModerator={isProModerator}
      />

      {/* --- WEEKLY CHALLENGE GALLERY --- */}
      <section className="container py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-brand-300">
              🎣 Featured #HookdChallenge Catches
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {challengePosts.length > 0 ? (
                challengePosts.map((p) => (
                  <PostCard key={p.id} post={p} onOpen={setActive} />
                ))
              ) : (
                <p className="text-white/60">
                  No challenge posts yet — be the first to tag your catch with{" "}
                  <span className="text-brand-300">#HookdChallenge</span>!
                </p>
              )}
            </div>
          </div>
          <aside className="glass rounded-3xl border border-white/10 p-6 self-start">
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
        <PostDetailModal post={active} onClose={() => setActive(null)} size="wide" />
      )}
    </main>
  );
}
