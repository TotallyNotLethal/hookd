"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Circle, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { fishingSpots, FishingSpot } from "@/lib/fishingSpots";
import { subscribeToCatchesWithCoordinates, CatchWithCoordinates } from "@/lib/firestore";
import { Check, MapPin, ShieldAlert, X } from "lucide-react";

const DEFAULT_POSITION: [number, number] = [40.7989, -81.3784];

const MATCH_DISTANCE_MILES = 0.5;
const MATCH_DISTANCE_METERS = MATCH_DISTANCE_MILES * 1609.34;

const USER_REPORTED_REGULATIONS: FishingSpot["regulations"] = {
  description: "User reported location. Verify public access and regulations before fishing.",
  bagLimit: "Check local authorities for current limits.",
};

type SpeciesFilters = Record<string, boolean>;

type SpotCatchSummary = {
  id?: string;
  species: string;
  weight?: string | null;
  bait?: string | null;
  displayName?: string | null;
  occurredAt?: Date | null;
  source: "dynamic" | "static";
};

type SpotPin = {
  id: string;
  latitude: number;
  longitude: number;
};

type MapSpot = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  species: string[];
  regulations: FishingSpot["regulations"] | null;
  catchCount: number;
  latestCatch: SpotCatchSummary | null;
  fromStatic: boolean;
  pins: SpotPin[];
  aggregationRadiusMeters: number | null;
};

const icon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
});

function formatCatchDate(date?: Date | null) {
  if (!date) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MapRelocator({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 11);
  }, [map, position]);
  return null;
}

function computeDistanceMiles(a: [number, number], b: [number, number]) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(la1) * Math.cos(la2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c * 10) / 10;
}

function catchBelongsToStaticSpot(
  spot: MapSpot,
  catchDoc: CatchWithCoordinates,
): boolean {
  if (!catchDoc.coordinates) return false;
  const catchPosition: [number, number] = [catchDoc.coordinates.lat, catchDoc.coordinates.lng];
  return computeDistanceMiles([spot.latitude, spot.longitude], catchPosition) <= MATCH_DISTANCE_MILES;
}

function getSpotCatches(
  spot: MapSpot | null,
  catches: CatchWithCoordinates[],
): CatchWithCoordinates[] {
  if (!spot) return [];
  if (spot.pins.length > 0) {
    const pinIds = new Set(spot.pins.map((pin) => pin.id));
    return catches.filter((catchDoc) => pinIds.has(catchDoc.id));
  }
  if (spot.fromStatic) {
    return catches.filter((catchDoc) => catchBelongsToStaticSpot(spot, catchDoc));
  }
  return [];
}

function parseWeightValue(weight?: string | null): number | null {
  if (!weight) return null;
  const sanitized = weight.replace(/,/g, "").trim();
  const match = sanitized.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (Number.isNaN(value)) return null;
  if (/oz/i.test(sanitized) && !/lb/i.test(sanitized)) {
    return value / 16;
  }
  return value;
}

type LeaderboardEntry = {
  species: string;
  rankings: {
    id: string;
    displayName: string;
    weightLabel: string;
    weightValue: number;
  }[];
};

type SpotDetailsPanelProps = {
  spot: MapSpot;
  catches: CatchWithCoordinates[];
  onClose: () => void;
};

function SpotDetailsPanel({ spot, catches, onClose }: SpotDetailsPanelProps) {
  const leaderboards = useMemo<LeaderboardEntry[]>(() => {
    const perSpecies = new Map<string, LeaderboardEntry["rankings"]>();

    catches.forEach((catchDoc) => {
      const weightValue = parseWeightValue(catchDoc.weight);
      if (weightValue === null) return;

      const speciesKey = catchDoc.species || "Unknown";
      if (!perSpecies.has(speciesKey)) {
        perSpecies.set(speciesKey, []);
      }

      perSpecies.get(speciesKey)!.push({
        id: catchDoc.id,
        displayName: catchDoc.displayName || "Anonymous angler",
        weightLabel: catchDoc.weight || "",
        weightValue,
      });
    });

    return Array.from(perSpecies.entries())
      .map(([species, rankings]) => ({
        species,
        rankings: rankings
          .sort((a, b) => b.weightValue - a.weightValue)
          .slice(0, 5),
      }))
      .sort((a, b) => a.species.localeCompare(b.species));
  }, [catches]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-detail-heading"
        className="max-h-full w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-slate-900/80 px-6 py-4">
          <div>
            <h2 id="spot-detail-heading" className="text-xl font-semibold text-white">
              {spot.name}
            </h2>
            <p className="text-sm text-white/60">
              {spot.regulations?.description || "Community reported fishing location."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 p-1 text-white/70 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            aria-label="Close spot details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex max-h-[75vh] flex-col gap-6 overflow-y-auto px-6 py-6 text-white">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Catch log</h3>
            {catches.length === 0 ? (
              <p className="text-sm text-white/60">
                No public catches logged at this spot yet. Be the first to add one!
              </p>
            ) : (
              <ul className="space-y-4">
                {catches.map((catchDoc) => {
                  const occurredAt = catchDoc.capturedAt ?? catchDoc.createdAt ?? null;
                  return (
                    <li key={catchDoc.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-brand-100">{catchDoc.species || "Unknown species"}</p>
                          {catchDoc.weight && (
                            <p className="text-sm text-white/80">Weight: {catchDoc.weight}</p>
                          )}
                          {catchDoc.caption && (
                            <p className="mt-1 text-sm text-white/70">{catchDoc.caption}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-white/60">
                          <p>{catchDoc.displayName || "Anonymous angler"}</p>
                          {occurredAt && <p>{formatCatchDate(occurredAt)}</p>}
                        </div>
                      </div>
                      {catchDoc.location && (
                        <p className="mt-2 text-xs text-white/50">{catchDoc.location}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Leaderboard</h3>
            {leaderboards.length === 0 ? (
              <p className="text-sm text-white/60">
                Weight data will appear once anglers log catches with measurements.
              </p>
            ) : (
              <div className="space-y-4">
                {leaderboards.map((board) => (
                  <div key={board.species} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <p className="text-sm font-semibold text-brand-100">{board.species}</p>
                    <ol className="mt-3 space-y-2 text-sm">
                      {board.rankings.map((entry, index) => (
                        <li key={entry.id} className="flex items-center justify-between">
                          <span className="text-white/80">
                            <span className="mr-2 text-xs uppercase tracking-wide text-white/40">
                              #{index + 1}
                            </span>
                            {entry.displayName}
                          </span>
                          <span className="font-semibold text-brand-200">{entry.weightLabel}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function toStaticSummary(latest: FishingSpot["latestCatch"] | null): SpotCatchSummary | null {
  if (!latest) return null;
  return {
    species: latest.species,
    weight: latest.weight,
    bait: latest.bait,
    source: "static",
  };
}

function toDynamicSummary(catchDoc: CatchWithCoordinates): SpotCatchSummary {
  const occurredAt = catchDoc.capturedAt ?? catchDoc.createdAt ?? null;
  return {
    id: catchDoc.id,
    species: catchDoc.species,
    weight: catchDoc.weight ?? null,
    displayName: catchDoc.displayName ?? null,
    occurredAt,
    source: "dynamic",
  };
}

type BaseBucket = {
  spot: FishingSpot;
  speciesSet: Set<string>;
  catchCount: number;
  latestCatch: SpotCatchSummary | null;
  latestTime: number;
  fallbackLatest: SpotCatchSummary | null;
  pins: SpotPin[];
};

type DynamicBucket = {
  anchorId: string;
  name: string;
  latitude: number;
  longitude: number;
  sumLat: number;
  sumLng: number;
  speciesSet: Set<string>;
  catchCount: number;
  latestCatch: SpotCatchSummary | null;
  latestTime: number;
  pins: SpotPin[];
};

function aggregateSpots(baseSpots: FishingSpot[], catches: CatchWithCoordinates[]): MapSpot[] {
  const baseBuckets = new Map<string, BaseBucket>();
  baseSpots.forEach((spot) => {
    baseBuckets.set(spot.id, {
      spot,
      speciesSet: new Set(spot.species),
      catchCount: 0,
      latestCatch: null,
      latestTime: Number.NEGATIVE_INFINITY,
      fallbackLatest: toStaticSummary(spot.latestCatch),
      pins: [],
    });
  });

  const dynamicBuckets: DynamicBucket[] = [];

  const sortedCatches = [...catches].sort((a, b) => {
    const aTime = (a.capturedAt ?? a.createdAt)?.getTime() ?? 0;
    const bTime = (b.capturedAt ?? b.createdAt)?.getTime() ?? 0;
    return aTime - bTime;
  });

  sortedCatches.forEach((catchDoc) => {
    if (!catchDoc.coordinates) return;

    const catchPosition: [number, number] = [catchDoc.coordinates.lat, catchDoc.coordinates.lng];
    let matchedBucket: BaseBucket | null = null;
    let matchedKey: string | null = null;
    let bestDistance = MATCH_DISTANCE_MILES;

    baseBuckets.forEach((bucket, key) => {
      const distance = computeDistanceMiles(
        [bucket.spot.latitude, bucket.spot.longitude],
        catchPosition,
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        matchedBucket = bucket;
        matchedKey = key;
      }
    });

    const summary = toDynamicSummary(catchDoc);
    const occurredAtTime = summary.occurredAt ? summary.occurredAt.getTime() : 0;

    if (matchedBucket && matchedKey) {
      matchedBucket.catchCount += 1;
      matchedBucket.speciesSet.add(catchDoc.species);
      if (occurredAtTime >= matchedBucket.latestTime) {
        matchedBucket.latestCatch = summary;
        matchedBucket.latestTime = occurredAtTime;
      }
      matchedBucket.pins.push({
        id: catchDoc.id,
        latitude: catchDoc.coordinates.lat,
        longitude: catchDoc.coordinates.lng,
      });
      return;
    }

    let targetBucket: DynamicBucket | null = null;
    let bestDynamicDistance = MATCH_DISTANCE_MILES;

    dynamicBuckets.forEach((bucket) => {
      const distance = computeDistanceMiles([bucket.latitude, bucket.longitude], catchPosition);
      if (distance <= bestDynamicDistance) {
        bestDynamicDistance = distance;
        targetBucket = bucket;
      }
    });

    if (!targetBucket) {
      targetBucket = {
        anchorId: catchDoc.id,
        name:
          (catchDoc.location && catchDoc.location.trim()) ||
          `Catch near ${catchDoc.coordinates.lat.toFixed(3)}, ${catchDoc.coordinates.lng.toFixed(3)}`,
        latitude: catchDoc.coordinates.lat,
        longitude: catchDoc.coordinates.lng,
        sumLat: 0,
        sumLng: 0,
        speciesSet: new Set<string>(),
        catchCount: 0,
        latestCatch: null,
        latestTime: Number.NEGATIVE_INFINITY,
        pins: [],
      };
      dynamicBuckets.push(targetBucket);
    }

    targetBucket.catchCount += 1;
    targetBucket.speciesSet.add(catchDoc.species);
    if (occurredAtTime >= targetBucket.latestTime) {
      targetBucket.latestCatch = summary;
      targetBucket.latestTime = occurredAtTime;
    }
    if (targetBucket.name.startsWith("Catch near") && catchDoc.location && catchDoc.location.trim()) {
      targetBucket.name = catchDoc.location.trim();
    }
    targetBucket.pins.push({
      id: catchDoc.id,
      latitude: catchDoc.coordinates.lat,
      longitude: catchDoc.coordinates.lng,
    });
    targetBucket.sumLat += catchDoc.coordinates.lat;
    targetBucket.sumLng += catchDoc.coordinates.lng;
    targetBucket.latitude = targetBucket.sumLat / targetBucket.catchCount;
    targetBucket.longitude = targetBucket.sumLng / targetBucket.catchCount;
    });

  const aggregated: MapSpot[] = [];

  baseBuckets.forEach((bucket) => {
    aggregated.push({
      id: bucket.spot.id,
      name: bucket.spot.name,
      latitude: bucket.spot.latitude,
      longitude: bucket.spot.longitude,
      species: Array.from(bucket.speciesSet),
      regulations: bucket.spot.regulations,
      catchCount: bucket.catchCount,
      latestCatch: bucket.latestCatch ?? bucket.fallbackLatest,
      fromStatic: true,
      pins: bucket.pins,
      aggregationRadiusMeters: bucket.pins.length > 0 ? MATCH_DISTANCE_METERS : null,
    });
  });

  dynamicBuckets.forEach((bucket) => {
    const sortedPins = [...bucket.pins].sort((a, b) => a.id.localeCompare(b.id));
    const anchorPin = sortedPins[0];
    const anchorId = anchorPin?.id ?? bucket.anchorId;
    aggregated.push({
      id: `dynamic-${anchorId}`,
      name: bucket.name,
      latitude: bucket.latitude,
      longitude: bucket.longitude,
      species: Array.from(bucket.speciesSet),
      regulations: USER_REPORTED_REGULATIONS,
      catchCount: bucket.catchCount,
      latestCatch: bucket.latestCatch,
      fromStatic: false,
      pins: sortedPins,
      aggregationRadiusMeters: MATCH_DISTANCE_METERS,
    });
  });

  return aggregated;
}

function buildSpeciesFilters(spots: MapSpot[]): SpeciesFilters {
  const filters: SpeciesFilters = {};
  spots.forEach((spot) => {
    spot.species.forEach((species) => {
      if (!(species in filters)) {
        filters[species] = true;
      }
    });
  });
  return filters;
}

export default function FishingMap() {
  const [userPosition, setUserPosition] = useState<[number, number]>(DEFAULT_POSITION);
  const [catchDocuments, setCatchDocuments] = useState<CatchWithCoordinates[]>([]);
  const [speciesFilters, setSpeciesFilters] = useState<SpeciesFilters>(() =>
    buildSpeciesFilters(aggregateSpots(fishingSpots, [])),
  );
  const [showRegulations, setShowRegulations] = useState(true);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition([position.coords.latitude, position.coords.longitude]);
      },
      () => {
        setUserPosition(DEFAULT_POSITION);
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToCatchesWithCoordinates((catches) => {
      setCatchDocuments(catches);
    });
    return () => unsubscribe();
  }, []);

  const aggregatedSpots = useMemo(
    () => aggregateSpots(fishingSpots, catchDocuments),
    [catchDocuments],
  );

  const selectedSpot = useMemo(
    () => aggregatedSpots.find((spot) => spot.id === selectedSpotId) ?? null,
    [aggregatedSpots, selectedSpotId],
  );

  const selectedSpotCatches = useMemo(
    () => getSpotCatches(selectedSpot, catchDocuments),
    [selectedSpot, catchDocuments],
  );

  useEffect(() => {
    setSpeciesFilters((prev) => {
      const next = { ...prev };
      let changed = false;
      aggregatedSpots.forEach((spot) => {
        spot.species.forEach((species) => {
          if (!(species in next)) {
            next[species] = true;
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
  }, [aggregatedSpots]);

  const filteredSpots = useMemo(() => {
    return aggregatedSpots.filter((spot) => {
      if (spot.species.length === 0) return true;
      return spot.species.some((species) => speciesFilters[species] ?? true);
    });
  }, [aggregatedSpots, speciesFilters]);

  const sortedSpots = useMemo(() => {
    return filteredSpots
      .map((spot) => {
        const distance = computeDistanceMiles(userPosition, [spot.latitude, spot.longitude]);
        return { ...spot, distance };
      })
      .sort((a, b) => a.distance - b.distance);
  }, [filteredSpots, userPosition]);

  const toggleSpecies = (species: string) => {
    setSpeciesFilters((prev) => ({ ...prev, [species]: !prev[species] }));
  };

  const speciesKeys = useMemo(() => Object.keys(speciesFilters).sort(), [speciesFilters]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="overflow-hidden rounded-3xl border border-white/10">
        <MapContainer
          center={userPosition}
          zoom={11}
          scrollWheelZoom
          style={{ height: "480px", width: "100%" }}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
        >
          <MapRelocator position={userPosition} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
          />
          {filteredSpots.map((spot) => {
            const latest = spot.latestCatch;
            const occurredAt = latest?.occurredAt ? formatCatchDate(latest.occurredAt) : null;
            const circleColor = spot.fromStatic ? "#0d8be6" : "#22d3ee";
            const showAggregationCircle =
              !spot.fromStatic && spot.aggregationRadiusMeters && spot.pins.length > 0;

            return (
              <Fragment key={spot.id}>
                {showAggregationCircle && (
                  <Circle
                    center={[spot.latitude, spot.longitude]}
                    radius={spot.aggregationRadiusMeters!}
                    pathOptions={{ color: circleColor, fillOpacity: 0.08, weight: 1, dashArray: "6 4" }}
                  />
                )}
                {spot.pins.map((pin) => (
                  <CircleMarker
                    key={`${spot.id}-pin-${pin.id}`}
                    center={[pin.latitude, pin.longitude]}
                    radius={4}
                    pathOptions={{ color: circleColor, weight: 1, fillColor: circleColor, fillOpacity: 0.7 }}
                  />
                ))}
                <Marker position={[spot.latitude, spot.longitude]} icon={icon}>
                  <Popup>
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold">{spot.name}</h3>
                      {spot.regulations?.description && (
                        <p className="text-sm text-slate-600">{spot.regulations.description}</p>
                      )}
                      <p className="text-sm text-slate-600">
                        {spot.catchCount > 0 ? (
                          <>
                            Logged catches: <strong>{spot.catchCount}</strong>
                          </>
                        ) : (
                          "No catches logged yet"
                        )}
                      </p>
                      {latest && (
                        <p className="text-sm">
                          Latest catch: <strong>{latest.species}</strong>
                          {latest.weight ? ` (${latest.weight})` : ""}
                          {latest.source === "dynamic" && latest.displayName
                            ? ` by ${latest.displayName}`
                            : ""}
                          {latest.source === "dynamic" && occurredAt ? ` on ${occurredAt}` : ""}
                          {latest.source === "static" && latest.bait ? ` on ${latest.bait}` : ""}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        Species logged: {spot.species.length > 0 ? spot.species.join(", ") : "TBD"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedSpotId(spot.id)}
                        className="w-full rounded-xl bg-brand-500/90 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                      >
                        View catches at this spot
                      </button>
                    </div>
                  </Popup>
                </Marker>
              </Fragment>
            );
          })}
          {showRegulations && (
            <>
              {filteredSpots
                .filter((spot) => spot.fromStatic)
                .map((spot) => (
                  <Circle
                    key={`${spot.id}-regs`}
                    center={[spot.latitude, spot.longitude]}
                    radius={1200}
                    pathOptions={{ color: "#0d8be6", fillOpacity: 0.08 }}
                  />
                ))}
            </>
          )}
        </MapContainer>
      </div>

      <aside className="glass rounded-3xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Species filters</h2>
          <p className="text-sm text-white/60">Toggle species to highlight matching spots on the map.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {speciesKeys.map((species) => {
              const isActive = speciesFilters[species];
              return (
                <button
                  key={species}
                  type="button"
                  onClick={() => toggleSpecies(species)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                    isActive
                      ? "border-brand-400 bg-brand-400/20 text-brand-100"
                      : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {isActive && <Check className="h-3.5 w-3.5" />}
                  {species}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/30 bg-white/10"
              checked={showRegulations}
              onChange={(event) => setShowRegulations(event.target.checked)}
            />
            Show public access & regulation overlay
          </label>
          <p className="mt-2 flex items-center gap-2 text-xs text-white/60">
            <ShieldAlert className="h-4 w-4 text-brand-200" />
            Blue halos indicate water with known access rules and bag limits.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white">Nearby waters</h3>
          <ul className="mt-3 space-y-3">
            {sortedSpots.map((spot) => {
              const latest = spot.latestCatch;
              const occurredAt = latest?.occurredAt ? formatCatchDate(latest.occurredAt) : null;

              return (
                <li key={spot.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{spot.name}</p>
                      <p className="text-xs uppercase tracking-wide text-white/50">
                        {spot.distance} mi • {spot.species.slice(0, 2).join(", ") || "Various species"}
                      </p>
                    </div>
                    <MapPin className="h-4 w-4 text-brand-300" />
                  </div>
                  {spot.regulations?.description && (
                    <p className="mt-3 text-sm text-white/70">{spot.regulations.description}</p>
                  )}
                  {spot.regulations?.bagLimit && (
                    <p className="mt-2 text-xs text-white/60">Bag limit: {spot.regulations.bagLimit}</p>
                  )}
                  <p className="mt-2 text-xs text-white/60">
                    Logged catches: {spot.catchCount > 0 ? spot.catchCount : "No data yet"}
                  </p>
                  {latest && (
                    <p className="mt-2 text-xs text-brand-200">
                      Latest catch: {latest.species}
                      {latest.weight ? ` (${latest.weight})` : ""}
                      {latest.source === "dynamic" && latest.displayName ? ` by ${latest.displayName}` : ""}
                      {latest.source === "dynamic" && occurredAt ? ` on ${occurredAt}` : ""}
                      {latest.source === "static" && latest.bait ? ` on ${latest.bait}` : ""}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedSpotId(spot.id)}
                    className="mt-3 inline-flex items-center justify-center rounded-xl bg-brand-500/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                  >
                    View catches at this spot
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {selectedSpot && (
        <SpotDetailsPanel
          spot={selectedSpot}
          catches={selectedSpotCatches}
          onClose={() => setSelectedSpotId(null)}
        />
      )}
    </div>
  );
}
