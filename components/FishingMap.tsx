"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { fishingSpots, FishingSpot } from "@/lib/fishingSpots";
import { subscribeToCatchesWithCoordinates, CatchWithCoordinates } from "@/lib/firestore";
import { Check, MapPin, ShieldAlert } from "lucide-react";

const DEFAULT_POSITION: [number, number] = [40.7989, -81.3784];

const MATCH_DISTANCE_MILES = 0.75;

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
};

type DynamicBucket = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speciesSet: Set<string>;
  catchCount: number;
  latestCatch: SpotCatchSummary | null;
  latestTime: number;
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
    });
  });

  const dynamicBuckets = new Map<string, DynamicBucket>();

  catches.forEach((catchDoc) => {
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
      return;
    }

    const dynamicKey = `dynamic-${catchDoc.coordinates.lat.toFixed(3)}-${catchDoc.coordinates.lng.toFixed(3)}`;
    if (!dynamicBuckets.has(dynamicKey)) {
      dynamicBuckets.set(dynamicKey, {
        id: dynamicKey,
        name:
          (catchDoc.location && catchDoc.location.trim()) ||
          `Catch near ${catchDoc.coordinates.lat.toFixed(3)}, ${catchDoc.coordinates.lng.toFixed(3)}`,
        latitude: catchDoc.coordinates.lat,
        longitude: catchDoc.coordinates.lng,
        speciesSet: new Set<string>(),
        catchCount: 0,
        latestCatch: null,
        latestTime: Number.NEGATIVE_INFINITY,
      });
    }

    const bucket = dynamicBuckets.get(dynamicKey)!;
    bucket.catchCount += 1;
    bucket.speciesSet.add(catchDoc.species);
    if (occurredAtTime >= bucket.latestTime) {
      bucket.latestCatch = summary;
      bucket.latestTime = occurredAtTime;
    }
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
    });
  });

  dynamicBuckets.forEach((bucket) => {
    aggregated.push({
      id: bucket.id,
      name: bucket.name,
      latitude: bucket.latitude,
      longitude: bucket.longitude,
      species: Array.from(bucket.speciesSet),
      regulations: USER_REPORTED_REGULATIONS,
      catchCount: bucket.catchCount,
      latestCatch: bucket.latestCatch,
      fromStatic: false,
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

            return (
              <Marker key={spot.id} position={[spot.latitude, spot.longitude]} icon={icon}>
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
                  </div>
                </Popup>
              </Marker>
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
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
