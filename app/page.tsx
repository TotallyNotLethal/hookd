import NavBar from "@/components/NavBar";
import Image from "next/image";
import Link from "next/link";

export default function Page() {
  return (
    <main>
      <NavBar />
      <section className="relative pt-28">
        <div className="absolute inset-0 -z-10">
          <Image src="/sample/catches/bass1.jpg" alt="Hero" fill className="object-cover opacity-20" />
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
              <Link href="/feed" className="btn-primary">Explore Feed</Link>
              <Link href="/login" className="px-5 py-2.5 rounded-xl border border-white/15 hover:bg-white/5">Sign In</Link>
            </div>
            <p className="text-white/60 text-sm">Installable PWA • Mobile-first design • Free to start</p>
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
                <p className="text-white/80 text-sm">Catch a bass over 3lb using paddle tails. Share with #HookdChallenge.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
