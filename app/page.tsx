'use client';
import "@/lib/firebaseClient";
import NavBar from "@/components/NavBar";
import Image from "next/image";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import { subscribeToChallengeCatches  } from "@/lib/firestore";
import { useEffect, useState } from "react";
import PostDetailModal from "@/app/feed/PostDetailModal";



export default function Page() {
  const [challengePosts, setChallengePosts] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);


  useEffect(() => {
  // 🔥 Force Firebase/Firestore to initialize immediately,
  // even if the Feed page hasn’t been opened yet
  import("@/lib/firebaseClient").then(({ db }) => {
    console.log("Firestore initialized on homepage:", db);
  });

  const unsub = subscribeToChallengeCatches(setChallengePosts);
  return () => unsub();
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
            <div className="grid grid-cols-2 gap-4">
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
              <div className="col-span-2 card p-4">
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

      {/* --- WEEKLY CHALLENGE GALLERY --- */}
      <section className="container py-16">
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
      </section>
      {active && (
  <PostDetailModal post={active} onClose={() => setActive(null)} />
)}
    </main>
  );
}
