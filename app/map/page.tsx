"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import NavBar from "@/components/NavBar";
import TrendingExplorer from "@/components/TrendingExplorer";
import ForecastPanel from "@/components/forecasts/ForecastPanel";
import {
  subscribeToActiveTournaments,
  subscribeToSpeciesTrendingInsights,
  subscribeToTournamentLeaderboardByLength,
  subscribeToTournamentLeaderboardByWeight,
} from "@/lib/firestore";
import type {
  SpeciesTrendingInsight,
  Tournament,
  TournamentLeaderboardEntry,
} from "@/lib/firestore";
import { fishingSpots } from "@/lib/fishingSpots";
import { useProAccess } from "@/hooks/useProAccess";

const FishingMap = dynamic(() => import("@/components/FishingMap"), { ssr: false });

export default function MapPage() {
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [weightLeaders, setWeightLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [lengthLeaders, setLengthLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [speciesInsights, setSpeciesInsights] = useState<SpeciesTrendingInsight[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(
    fishingSpots.length > 0 ? fishingSpots[0]!.id : null
  );
  const { isPro, profile } = useProAccess();

  const selectedSpot = useMemo(() => {
    if (!selectedSpotId) return fishingSpots[0] ?? null;
    return fishingSpots.find((spot) => spot.id === selectedSpotId) ?? fishingSpots[0] ?? null;
  }, [selectedSpotId]);

  const forecastLatitude = selectedSpot?.latitude ?? 40.7989;
  const forecastLongitude = selectedSpot?.longitude ?? -81.3784;

  useEffect(() => {
    const unsubscribeWeight = subscribeToTournamentLeaderboardByWeight(10, (entries) => {
      setWeightLeaders(entries);
    });
    const unsubscribeLength = subscribeToTournamentLeaderboardByLength(10, (entries) => {
      setLengthLeaders(entries);
    });

    return () => {
      if (typeof unsubscribeWeight === "function") unsubscribeWeight();
      if (typeof unsubscribeLength === "function") unsubscribeLength();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToActiveTournaments((events) => {
      setActiveTournaments(events);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSpeciesTrendingInsights((insights) => {
      setSpeciesInsights(insights);
    }, {
      weeks: 6,
      maxSamples: 600,
      speciesLimit: 6,
      minBaitSamples: 2,
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return (
    <main>
      <NavBar />
      <section className="px-4 pt-nav pb-16 sm:px-6">
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

        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Environmental outlook</p>
              <p className="text-xs text-white/60">
                Compare bite windows before you drop a pin. Forecasts update every few minutes.
              </p>
            </div>
            <label className="text-xs text-white/70">
              <span className="mr-2 uppercase tracking-[0.2em] text-white/40">Location</span>
              <select
                className="input bg-slate-950/80 text-sm"
                value={selectedSpotId ?? ""}
                onChange={(event) => setSelectedSpotId(event.target.value || null)}
              >
                {fishingSpots.slice(0, 12).map((spot) => (
                  <option key={spot.id} value={spot.id}>
                    {spot.name}, {spot.state}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ForecastPanel
            latitude={forecastLatitude}
            longitude={forecastLongitude}
            locationLabel={selectedSpot ? `${selectedSpot.name}, ${selectedSpot.state}` : undefined}
            viewer={profile}
          />
        </div>

        <FishingMap isProMember={isPro} />
        </div>
      </section>

      <TrendingExplorer
        className="pb-20"
        activeTournaments={activeTournaments}
        weightLeaders={weightLeaders}
        lengthLeaders={lengthLeaders}
        speciesInsights={speciesInsights}
      />
    </main>
  );
}
