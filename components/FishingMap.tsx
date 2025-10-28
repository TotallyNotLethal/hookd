"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Circle, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { fishingSpots } from "@/lib/fishingSpots";
import { subscribeToCatchesWithCoordinates, type CatchWithCoordinates } from "@/lib/firestore";
import {
  aggregateSpots,
  buildSpeciesFilters,
  computeDistanceMiles,
  type SpeciesFilters,
} from "@/lib/mapSpots";
import { Check, MapPin, ShieldAlert } from "lucide-react";

const DEFAULT_POSITION: [number, number] = [40.7989, -81.3784];

type FishingMapProps = {
  allowedUids?: string[];
  includeReferenceSpots?: boolean;
  className?: string;
  showRegulationsToggle?: boolean;
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

export default function FishingMap({
  allowedUids,
  includeReferenceSpots = true,
  className,
  showRegulationsToggle = true,
}: FishingMapProps) {
  const router = useRouter();
  const [userPosition, setUserPosition] = useState<[number, number]>(DEFAULT_POSITION);
  const [catchDocuments, setCatchDocuments] = useState<CatchWithCoordinates[]>([]);
  const geoSupported = useMemo(
    () => typeof navigator !== "undefined" && Boolean(navigator.geolocation),
    [],
  );
  const [geoStatus, setGeoStatus] = useState<string | null>(() =>
    geoSupported ? null : "Location detection isn't available in this browser.",
  );
  const [geoLoading, setGeoLoading] = useState(false);
  const baseSpots = useMemo(
    () => (includeReferenceSpots ? fishingSpots : [] as typeof fishingSpots),
    [includeReferenceSpots],
  );
  const initialSpeciesFilters = useMemo(
    () => buildSpeciesFilters(aggregateSpots(baseSpots, [])),
    [baseSpots],
  );
  const [speciesFilters, setSpeciesFilters] = useState<SpeciesFilters>(initialSpeciesFilters);
  const defer = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  }, []);
  const allowRegulationOverlay = includeReferenceSpots && showRegulationsToggle;
  const [showRegulations, setShowRegulations] = useState(allowRegulationOverlay);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSpeciesFilters(initialSpeciesFilters);
  }, [initialSpeciesFilters]);

  useEffect(() => {
    setShowRegulations(allowRegulationOverlay);
  }, [allowRegulationOverlay]);

  const requestUserPosition = useCallback(() => {
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
        setUserPosition([position.coords.latitude, position.coords.longitude]);
        setGeoLoading(false);
        setGeoStatus(null);
      },
      (error) => {
        console.warn("Unable to access geolocation", error);
        if (!isMountedRef.current) {
          return;
        }
        setGeoLoading(false);
        setGeoStatus("We couldn't access your location. Showing default map view.");
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, [geoLoading, geoSupported]);

  useEffect(() => {
    const unsubscribe = subscribeToCatchesWithCoordinates(
      (catches) => {
        setCatchDocuments(catches);
      },
      { allowedUids },
    );
    return () => unsubscribe();
  }, [allowedUids]);

  const aggregatedSpots = useMemo(
    () => aggregateSpots(baseSpots, catchDocuments),
    [baseSpots, catchDocuments],
  );

  useEffect(() => {
    defer(() => {
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
    });
  }, [aggregatedSpots, defer]);

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

  const handleOpenSpot = (spotId: string) => {
    router.push(`/map/${encodeURIComponent(spotId)}`);
  };

  return (
    <div className={clsx("grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]", className)}>
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-3xl border border-white/10">
          {geoSupported ? (
            <button
              type="button"
              onClick={requestUserPosition}
              className="absolute right-4 top-4 z-[401] rounded-full border border-white/20 bg-slate-900/80 px-4 py-1.5 text-sm font-medium text-white/90 shadow transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={geoLoading}
            >
              {geoLoading ? "Locating…" : "Use my location"}
            </button>
          ) : null}
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
                        onClick={() => handleOpenSpot(spot.id)}
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
          {showRegulations && allowRegulationOverlay && (
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
        {geoStatus ? <p className="text-xs text-white/60">{geoStatus}</p> : null}
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

        {allowRegulationOverlay ? (
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
        ) : null}

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
                    onClick={() => handleOpenSpot(spot.id)}
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
    </div>
  );
}
