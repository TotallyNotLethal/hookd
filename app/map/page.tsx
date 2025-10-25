import dynamic from "next/dynamic";
import NavBar from "@/components/NavBar";
import TrendingExplorer from "@/components/TrendingExplorer";

const FishingMap = dynamic(() => import("@/components/FishingMap"), { ssr: false });

export default function MapPage() {
  return (
    <main>
      <NavBar />
      <section className="pt-28 pb-16">
        <div className="container space-y-10">
          <header className="max-w-3xl space-y-4">
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Plan smarter</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-white">
              Discover public hotspots with live species filters
            </h1>
            <p className="text-white/70 text-base">
              The Hook&apos;d fishing map highlights waters with recent activity, regulations, and access rules so you can fish
              legally and efficiently. Adjust the filters to surface the best spots for your target species and tap a marker to
              review catches, baits, and bag limits.
            </p>
          </header>

          <FishingMap />
        </div>
      </section>

      <TrendingExplorer className="pb-20" />
    </main>
  );
}
