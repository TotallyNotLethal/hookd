'use client';
import "@/lib/firebaseClient";
import NavBar from "@/components/NavBar";
import Image from "next/image";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import ConditionsWidget from "@/components/ConditionsWidget";
import {
  getChallengeCatches,
  subscribeToChallengeCatches,
  subscribeToFeedCatches,
} from "@/lib/firestore";
import { useEffect, useMemo, useState } from "react";
import PostDetailModal from "@/app/feed/PostDetailModal";



export default function Page() {
  const [challengePosts, setChallengePosts] = useState<any[]>([]);
  const [recentCatches, setRecentCatches] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);

  const leaderboard = useMemo(() => {
    const scores = new Map<
      string,
      {
        uid: string;
        displayName: string;
        likes: number;
        comments: number;
      }
    >();

    challengePosts.forEach((post) => {
      const uid = post.uid || post.userId;
      if (!uid) return;

      const entry = scores.get(uid) || {
        uid,
        displayName: post.displayName || "Angler",
        likes: 0,
        comments: 0,
      };

      entry.likes += typeof post.likesCount === "number" ? post.likesCount : 0;
      entry.comments +=
        typeof post.commentsCount === "number" ? post.commentsCount : 0;

      scores.set(uid, entry);
    });

    return Array.from(scores.values())
      .map((entry) => ({
        ...entry,
        score: entry.likes > 0 ? entry.likes : entry.comments,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.likes !== a.likes) return b.likes - a.likes;
        return b.comments - a.comments;
      });
  }, [challengePosts]);


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




  return (
    <main>
      <NavBar />

      {/* --- HERO SECTION --- */}
      <section className="relative pt-28">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/sample/catches/bass1.jpg"
            alt="Hero"
            fill
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg)]" />
        </div>

        <div className="container grid lg:grid-cols-2 gap-10 items-center py-16">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl font-semibold leading-tight">
              Join the <span className="text-brand-300">Hook&apos;d</span> community
            </h1>
            <p className="text-white/80 text-lg max-w-xl">
              Share your catches, discover new spots, and level up your fishing game with real-time reports and leaderboards.
            </p>
            <div className="flex items-center gap-4">
              <Link href="/feed" className="btn-primary">
                Explore Feed
              </Link>
              <Link
                href="/login"
                className="px-5 py-2.5 rounded-xl border border-white/15 hover:bg-white/5"
              >
                Sign In
              </Link>
            </div>
            <p className="text-white/60 text-sm">
              Installable PWA • Mobile-first design • Free to start
            </p>
          </div>

          <div className="glass rounded-3xl p-6 border-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ConditionsWidget
                className="sm:col-span-2"
                location={{
                  name: "Canton, OH",
                  latitude: 40.7989,
                  longitude: -81.3784,
                  timezone: "America/New_York",
                }}
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
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x">
            {recentCatches.map((post) => (
              <div
                key={post.id}
                className="min-w-[260px] sm:min-w-[320px] snap-start"
              >
                <PostCard post={post} onOpen={setActive} />
              </div>
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
            <h3 className="text-lg font-semibold text-brand-200 mb-4">
              Challenge Leaderboard
            </h3>
            {leaderboard.length > 0 ? (
              <ol className="space-y-3">
                {leaderboard.slice(0, 3).map((angler, index) => {
                  const label = angler.likes > 0 ? "likes" : "comments";
                  const score = angler.likes > 0 ? angler.likes : angler.comments;
                  return (
                    <li key={angler.uid} className="card p-4 flex items-center gap-4">
                      <span className="text-2xl font-semibold text-brand-300 w-6">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <Link
                          href={`/profile/${angler.uid}`}
                          className="font-medium hover:text-brand-200 transition"
                        >
                          {angler.displayName}
                        </Link>
                        <p className="text-sm text-white/70">
                          {score} {label}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="card p-4 text-white/70 text-sm">
                Be the first to land a challenge catch and claim the top spot on the
                leaderboard!
              </div>
            )}
          </aside>
        </div>
      </section>
      {active && (
        <PostDetailModal post={active} onClose={() => setActive(null)} />
      )}
    </main>
  );
}
