"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface TrendingExplorerProps {
  className?: string;
}

type Lake = {
  id: string;
  name: string;
  state: string;
  species: string[];
  pressure: "light" | "moderate" | "heavy";
  recentActivity: string;
};

type Challenge = {
  id: string;
  title: string;
  description: string;
  hashtag: string;
  expiresAt: string;
};

const lakes: Lake[] = [
  {
    id: "sippo",
    name: "Sippo Lake",
    state: "Ohio",
    species: ["Largemouth Bass", "Channel Catfish", "Bluegill"],
    pressure: "moderate",
    recentActivity: "Multiple bass caught on chatterbaits this week.",
  },
  {
    id: "nimisila",
    name: "Nimisila Reservoir",
    state: "Ohio",
    species: ["Muskie", "Yellow Perch", "Crappie"],
    pressure: "light",
    recentActivity: "Evening topwater bite is picking up along the south shore.",
  },
  {
    id: "portage",
    name: "Portage Lakes",
    state: "Ohio",
    species: ["Smallmouth Bass", "Carp", "Walleye"],
    pressure: "heavy",
    recentActivity: "Reports of suspended smallmouth around submerged structure.",
  },
];

const lakeFilters = [
  { id: "all", label: "All" },
  { id: "light", label: "Light pressure" },
  { id: "moderate", label: "Moderate" },
  { id: "heavy", label: "Heavy" },
];

const featuredSpecies = [
  {
    name: "Largemouth Bass",
    tips: "Target weed edges with slow-rolled swimbaits.",
    bestBaits: ["Swimbait", "Texas-rig", "Squarebill"],
  },
  {
    name: "Crappie",
    tips: "Vertical jig brush piles and docks mid-morning.",
    bestBaits: ["Mini jig", "Minnow", "Slip float"],
  },
  {
    name: "Channel Catfish",
    tips: "Fresh cut bait along drop-offs after sunset.",
    bestBaits: ["Cut shad", "Stink bait", "Live bluegill"],
  },
];

const challenges: Challenge[] = [
  {
    id: "paddle-tail",
    title: "Paddle Tail Power Hour",
    description: "Land a bass on a paddle-tail swimbait before 9am.",
    hashtag: "#HookdChallenge",
    expiresAt: "3 days",
  },
  {
    id: "evening-walleye",
    title: "Glow Stick Walleye Run",
    description: "Post a legal walleye caught after sunset.",
    hashtag: "#NightBite",
    expiresAt: "1 week",
  },
  {
    id: "kid-does-work",
    title: "Lil' Anglers",
    description: "Share a catch from your favorite fishing partner under 12.",
    hashtag: "#FamilyFish",
    expiresAt: "5 days",
  },
];

export default function TrendingExplorer({ className = "" }: TrendingExplorerProps) {
  const [activeLakeFilter, setActiveLakeFilter] = useState("all");
  const [selectedSpeciesIndex, setSelectedSpeciesIndex] = useState(0);

  const filteredLakes = useMemo(() => {
    if (activeLakeFilter === "all") return lakes;
    return lakes.filter((lake) => lake.pressure === activeLakeFilter);
  }, [activeLakeFilter]);

  const selectedSpecies = featuredSpecies[selectedSpeciesIndex];

  return (
    <section className={`container py-16 ${className}`} aria-labelledby="discover-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Discover</p>
          <h2 id="discover-heading" className="text-2xl font-semibold text-white">
            Plan the next trip by lake, species, or challenge
          </h2>
        </div>
        <Link href="/feed" className="flex items-center gap-1 text-brand-300 hover:text-brand-200 text-sm md:text-base">
          Browse community tips <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Lakes */}
        <div className="glass rounded-3xl p-6" aria-labelledby="lake-explorer">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter lakes by fishing pressure">
            {lakeFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveLakeFilter(filter.id)}
                aria-pressed={activeLakeFilter === filter.id}
                className={`rounded-xl px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                  activeLakeFilter === filter.id
                    ? "bg-brand-500 text-white shadow-soft"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4" id="lake-explorer">
            {filteredLakes.map((lake) => (
              <article
                key={lake.id}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-brand-400/60"
              >
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{lake.name}</h3>
                    <p className="text-sm text-white/60">{lake.state}</p>
                  </div>
                  <span
                    className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/70"
                    aria-label={`Fishing pressure ${lake.pressure}`}
                  >
                    {lake.pressure}
                  </span>
                </header>
                <p className="mt-3 text-sm text-white/70">{lake.recentActivity}</p>
                <p className="mt-4 text-xs uppercase tracking-wide text-white/50">Popular species</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {lake.species.map((species) => (
                    <li key={species} className="rounded-full bg-brand-500/10 px-3 py-1 text-xs text-brand-100">
                      {species}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* Species */}
          <div className="glass rounded-3xl p-6" aria-labelledby="species-explorer">
            <h3 id="species-explorer" className="text-lg font-semibold text-white">
              Target a species
            </h3>
            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Featured species">
              {featuredSpecies.map((species, index) => {
                const isSelected = index === selectedSpeciesIndex;
                return (
                  <button
                    key={species.name}
                    role="tab"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => setSelectedSpeciesIndex(index)}
                    className={`rounded-xl px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                      isSelected
                        ? "bg-brand-500 text-white shadow-soft"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {species.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-sm text-white/80">{selectedSpecies.tips}</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-white/50">Confidence baits</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {selectedSpecies.bestBaits.map((bait) => (
                  <li key={bait} className="rounded-full bg-brand-400/20 px-3 py-1 text-xs text-brand-100">
                    {bait}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Challenges */}
          <div className="glass rounded-3xl p-6" aria-labelledby="challenge-explorer">
            <h3 id="challenge-explorer" className="text-lg font-semibold text-white">
              Upcoming challenges
            </h3>
            <ul className="mt-4 space-y-3">
              {challenges.map((challenge) => (
                <li key={challenge.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-white">{challenge.title}</h4>
                      <p className="mt-2 text-sm text-white/70">{challenge.description}</p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-white/60">{challenge.expiresAt}</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-brand-200">{challenge.hashtag}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
