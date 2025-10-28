"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import PostCard from "@/components/PostCard";
import ConditionsWidget from "@/components/ConditionsWidget";
import PostDetailModal from "@/app/feed/PostDetailModal";
import {
  aggregateSpots,
  buildLeaderboards,
  computeDistanceMiles,
  getSpotCatches,
  type LeaderboardEntry,
  type MapSpot,
} from "@/lib/mapSpots";
import { fishingSpots } from "@/lib/fishingSpots";
import { subscribeToCatchesWithCoordinates, type CatchWithCoordinates } from "@/lib/firestore";
import { CalendarClock, Fish, MapPin, Trophy, Users } from "lucide-react";

function formatDateTime(date: Date | null) {
  if (!date) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SpotHeader({
  spot,
  distance,
  lastUpdated,
  onRequestLocation,
  locating,
  locationStatus,
}: {
  spot: MapSpot;
  distance: number | null;
  lastUpdated: Date | null;
  onRequestLocation: (() => void) | null;
  locating: boolean;
  locationStatus: string | null;
}) {
  return (
    <div className="glass rounded-3xl border border-white/10 bg-slate-950/60 p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-brand-200/70">
            <MapPin className="h-4 w-4" />
            <span>Spot overview</span>
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-white md:text-4xl">{spot.name}</h1>
            {spot.regulations?.description ? (
              <p className="mt-2 text-sm text-white/70">{spot.regulations.description}</p>
            ) : (
              <p className="mt-2 text-sm text-white/70">
                Community reported water. Confirm public access rules before planning a trip.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
            <span>
              Lat/Lng: {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
            </span>
            {typeof distance === "number" ? (
              <span>Approx. {distance.toFixed(1)} miles from you</span>
            ) : onRequestLocation ? (
              <button
                type="button"
                onClick={onRequestLocation}
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium text-white/80 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={locating}
              >
                {locating ? "Locating…" : "Use my location for distance"}
              </button>
            ) : null}
            {lastUpdated && <span>Last activity: {formatDateTime(lastUpdated)}</span>}
          </div>
          {locationStatus ? (
            <p className="text-xs text-amber-200/80">{locationStatus}</p>
          ) : null}
          {spot.regulations?.bagLimit && (
            <p className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
              Bag limit guidance: {spot.regulations.bagLimit}
            </p>
          )}
          {!spot.fromStatic && (
            <p className="text-xs text-amber-300/80">
              This hotspot was created from shared catches within ~0.5 miles. Double-check regulations before visiting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SpotStats({
  catchCount,
  uniqueSpecies,
  anglers,
  leaderboard,
}: {
  catchCount: number;
  uniqueSpecies: string[];
  anglers: number;
  leaderboard: LeaderboardEntry[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
          <Trophy className="h-4 w-4" />
          Logged catches
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">{catchCount}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
          <Fish className="h-4 w-4" />
          Species tracked
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">{uniqueSpecies.length}</p>
        {uniqueSpecies.length > 0 && (
          <p className="mt-1 text-xs text-white/60 line-clamp-2">{uniqueSpecies.join(", ")}</p>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
          <Users className="h-4 w-4" />
          Active anglers
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">{anglers}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
          <CalendarClock className="h-4 w-4" />
          Leaderboard species
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">{leaderboard.length}</p>
      </div>
    </div>
  );
}

export default function SpotDetailPage() {
  const params = useParams();
  const rawSpotId = params?.spotId;
  const spotId = Array.isArray(rawSpotId) ? rawSpotId[0] : rawSpotId;
  const [catchDocuments, setCatchDocuments] = useState<CatchWithCoordinates[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCatch, setActiveCatch] = useState<any | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const geoSupported = useMemo(
    () => typeof navigator !== "undefined" && Boolean(navigator.geolocation),
    [],
  );
  const [geoStatus, setGeoStatus] = useState<string | null>(() =>
    geoSupported ? null : "Location detection isn't available in this browser.",
  );
  const [geoLoading, setGeoLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const requestUserLocation = useCallback(() => {
    if (!geoSupported || typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("Location detection isn't available in this browser.");
      return;
    }

    if (geoLoading) {
      return;
    }

    setGeoLoading(true);
    setGeoStatus("Locating your position…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMountedRef.current) {
          return;
        }
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setGeoLoading(false);
        setGeoStatus(null);
      },
      (error) => {
        console.warn("Unable to access geolocation", error);
        if (!isMountedRef.current) {
          return;
        }
        setGeoLoading(false);
        setGeoStatus("We couldn't access your location. Showing approximate data.");
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, [geoLoading, geoSupported]);

  useEffect(() => {
    const unsubscribe = subscribeToCatchesWithCoordinates((catches) => {
      setCatchDocuments(catches);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const aggregatedSpots = useMemo(
    () => aggregateSpots(fishingSpots, catchDocuments),
    [catchDocuments],
  );

  const spot = useMemo(
    () => aggregatedSpots.find((candidate) => candidate.id === spotId) ?? null,
    [aggregatedSpots, spotId],
  );

  const spotCatches = useMemo(
    () => getSpotCatches(spot, catchDocuments),
    [spot, catchDocuments],
  );

  const leaderboard = useMemo(() => buildLeaderboards(spotCatches), [spotCatches]);

  const uniqueSpecies = useMemo(() => {
    const set = new Set<string>();
    spot?.species.forEach((species) => {
      if (species) set.add(species);
    });
    spotCatches.forEach((catchDoc) => {
      if (catchDoc.species) {
        set.add(catchDoc.species);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [spot, spotCatches]);

  const anglers = useMemo(() => {
    const ids = new Set<string>();
    spotCatches.forEach((catchDoc) => {
      if (catchDoc.uid) {
        ids.add(catchDoc.uid);
      }
    });
    return ids.size;
  }, [spotCatches]);

  const lastUpdated = useMemo(() => {
    const latest = spotCatches[0];
    return latest?.capturedAtDate ?? latest?.createdAtDate ?? null;
  }, [spotCatches]);

  const distanceFromUser = useMemo(() => {
    if (!spot || !userLocation) return null;
    return computeDistanceMiles(userLocation, [spot.latitude, spot.longitude]);
  }, [spot, userLocation]);

  const fallbackLocation = spot
    ? {
        name: spot.name,
        latitude: spot.latitude,
        longitude: spot.longitude,
      }
    : null;

  return (
    <main>
      <NavBar />
      <section className="pt-24 pb-16">
        <div className="container space-y-10">
          <Link
            href="/map"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-200 transition hover:text-brand-100"
          >
            ← Back to fishing map
          </Link>

          {isLoading ? (
            <div className="glass rounded-3xl border border-white/10 p-10 text-center text-white/70">
              Loading spot intelligence…
            </div>
          ) : !spot ? (
            <div className="glass space-y-4 rounded-3xl border border-white/10 p-10 text-center text-white/70">
              <h1 className="text-2xl font-semibold text-white">We couldn&apos;t find that spot</h1>
              <p className="text-sm">
                It may have been renamed or no longer has public catches. Explore the map to discover other hotspots.
              </p>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <div className="space-y-6">
                <SpotHeader
                  spot={spot}
                  distance={distanceFromUser}
                  lastUpdated={lastUpdated}
                  onRequestLocation={geoSupported ? requestUserLocation : null}
                  locating={geoLoading}
                  locationStatus={geoStatus}
                />
                <SpotStats
                  catchCount={spotCatches.length}
                  uniqueSpecies={uniqueSpecies}
                  anglers={anglers}
                  leaderboard={leaderboard}
                />

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Public catches</h2>
                    <p className="text-sm text-white/60">
                      Click a card to review photos, tactics, and comments shared by the community.
                    </p>
                  </div>

                  {spotCatches.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-white/60">
                      No public catches logged for this spot yet. Be the first to drop a report!
                    </div>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {spotCatches.map((catchDoc) => (
                        <PostCard key={catchDoc.id} post={catchDoc} onOpen={setActiveCatch} />
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-6">
                {fallbackLocation && (
                  <ConditionsWidget
                    fallbackLocation={{
                      name: fallbackLocation.name,
                      latitude: fallbackLocation.latitude,
                      longitude: fallbackLocation.longitude,
                    }}
                    className="rounded-3xl border border-white/10 bg-slate-950/60 p-6"
                  />
                )}

                <div className="glass space-y-4 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
                  <h3 className="text-lg font-semibold text-white">Spot insights</h3>
                  <ul className="space-y-3 text-sm text-white/70">
                    <li>
                      <strong className="text-white">Aggregation radius:</strong> ~0.5 miles
                    </li>
                    <li>
                      <strong className="text-white">Catch pins:</strong> {spot.pins.length}
                    </li>
                    <li>
                      <strong className="text-white">Access type:</strong> {spot.fromStatic ? "Verified" : "Community reported"}
                    </li>
                  </ul>
                </div>

                <div className="glass space-y-4 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
                  <h3 className="text-lg font-semibold text-white">Leaderboard</h3>
                  {leaderboard.length === 0 ? (
                    <p className="text-sm text-white/60">
                      Weight data will populate after anglers log catches with measurements.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {leaderboard.map((entry) => (
                        <div key={entry.species} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm font-semibold text-brand-100">{entry.species}</p>
                          <ol className="mt-2 space-y-2 text-sm text-white/80">
                            {entry.rankings.map((ranking, index) => (
                              <li key={ranking.id} className="flex items-center justify-between gap-4">
                                <span>
                                  <span className="mr-2 text-xs uppercase tracking-wide text-white/40">#{index + 1}</span>
                                  {ranking.displayName}
                                </span>
                                <span className="font-semibold text-brand-200">{ranking.weightLabel}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>

      {activeCatch && <PostDetailModal post={activeCatch} onClose={() => setActiveCatch(null)} />}
    </main>
  );
}
