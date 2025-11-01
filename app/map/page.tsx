"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import NavBar from "@/components/NavBar";
import TrendingExplorer from "@/components/TrendingExplorer";
import ForecastPanel from "@/components/forecasts/ForecastPanel";
import { Loader2, AlertTriangle } from "lucide-react";
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
import { useProAccess } from "@/hooks/useProAccess";

const FishingMap = dynamic(() => import("@/components/FishingMap"), { ssr: false });

type MapFocusMetadata = {
  label?: string | null;
  source?: "geolocation" | "search" | "marker";
};

export default function MapPage() {
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [weightLeaders, setWeightLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [lengthLeaders, setLengthLeaders] = useState<TournamentLeaderboardEntry[]>([]);
  const [speciesInsights, setSpeciesInsights] = useState<SpeciesTrendingInsight[]>([]);
  const [focusedLocation, setFocusedLocation] = useState<{
    position: [number, number];
    label?: string;
  } | null>(null);
  const { isPro, profile } = useProAccess();

  const handleMapFocusChange = useCallback(
    (position: [number, number], metadata?: MapFocusMetadata) => {
      setFocusedLocation({
        position,
        label: metadata?.label ?? undefined,
      });
    },
    [],
  );

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
          <div>
            <FishingMap isProMember={isPro} onFocusChange={handleMapFocusChange} />
          </div>

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
              <div className="flex flex-col items-start gap-1 text-xs text-white/60 sm:items-end">
                <span className="uppercase tracking-[0.2em] text-white/40">Location</span>
                {focusedLocation ? (
                  <span className="text-sm font-semibold text-white">
                    {focusedLocation.label ??
                      `${focusedLocation.position[0].toFixed(3)}, ${focusedLocation.position[1].toFixed(3)}`}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-xs text-white/60">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Waiting for map selection…
                  </span>
                )}
              </div>
            </div>

            {focusedLocation ? (
              <ForecastPanel
                latitude={focusedLocation.position[0]}
                longitude={focusedLocation.position[1]}
                locationLabel={focusedLocation.label}
                viewer={profile}
              />
            ) : (
              <div className="glass rounded-3xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/70">
                <div className="flex items-center gap-3 text-white/60">
                  <AlertTriangle className="h-4 w-4" />
                  Select a marker, search for a place, or use geolocation to load forecasts for a spot.
                </div>
              </div>
            )}
          </div>
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
