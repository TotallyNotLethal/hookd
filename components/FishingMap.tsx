"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Circle, CircleMarker, useMap, Pane } from "react-leaflet";
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
import { Check, Loader2, MapPin, Search, ShieldAlert } from "lucide-react";

const DEFAULT_POSITION: [number, number] = [40.7989, -81.3784];

type MarineOverlayKey = "bathymetry" | "contours" | "labels";

type BaseLayerKey =
  | "osm"
  | "maptiler-streets"
  | "maptiler-outdoor"
  | "maptiler-ocean"
  | "maptiler-satellite";

type BaseLayerSource = {
  id: BaseLayerKey;
  label: string;
  description: string;
  url: string | null;
  attribution: string;
  requiresKey?: boolean;
  requiresPro?: boolean;
  format?: "png" | "jpg";
};

type MapTilerFeature = {
  id: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
  geometry?: { type: string; coordinates: [number, number] };
  properties?: {
    country?: string;
    region?: string;
    [key: string]: unknown;
  };
};

type MapTilerGeocodingResponse = {
  features?: MapTilerFeature[];
};

type MarineOverlaySource = {
  id: MarineOverlayKey;
  label: string;
  description?: string;
  url: string | null;
  attribution: string;
  pane: string;
  zIndex: number;
  defaultEnabled: boolean;
  requiresKey?: boolean;
  opacity?: number;
};

const createMarineOverlaySources = (): Record<MarineOverlayKey, MarineOverlaySource> => {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const hasKey = Boolean(mapTilerKey);
  const buildMapTilerUrl = (path: string) => (hasKey ? `https://api.maptiler.com${path}?key=${mapTilerKey}` : null);

  return {
    bathymetry: {
      id: "bathymetry",
      label: "Bathymetry shading",
      description: hasKey
        ? "Visualizes depth shading sourced from MapTiler's ocean basemap."
        : "Requires a MapTiler API key to render bathymetry tiles.",
      url: buildMapTilerUrl("/maps/ocean/{z}/{x}/{y}.png"),
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &amp; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      pane: "marine-bathymetry",
      zIndex: 210,
      defaultEnabled: true,
      requiresKey: true,
      opacity: 0.9,
    },
    contours: {
      id: "contours",
      label: "Depth contours",
      description: hasKey
        ? "Displays bathymetric contour labels for navigation planning."
        : "Requires a MapTiler API key to render contour labels.",
      url: buildMapTilerUrl("/tiles/bathymetry-lines/{z}/{x}/{y}.png"),
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>',
      pane: "marine-contours",
      zIndex: 220,
      defaultEnabled: false,
      requiresKey: true,
      opacity: 0.75,
    },
    labels: {
      id: "labels",
      label: "Marine navigation marks",
      description: "OpenSeaMap seamarks and harbor annotations.",
      url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors',
      pane: "marine-labels",
      zIndex: 230,
      defaultEnabled: true,
    },
  };
};

const createBaseLayerSources = (): BaseLayerSource[] => {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const hasKey = Boolean(mapTilerKey);
  const buildMapTilerStyleUrl = (style: string, extension: "png" | "jpg" = "png") =>
    hasKey ? `https://api.maptiler.com/maps/${style}/{z}/{x}/{y}.${extension}?key=${mapTilerKey}` : null;

  return [
    {
      id: "osm",
      label: "OpenStreetMap",
      description: "Community-maintained basemap served by OpenStreetMap contributors.",
      url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    {
      id: "maptiler-streets",
      label: "MapTiler Streets",
      description: hasKey
        ? "Vector-inspired street map suited for urban trip planning."
        : "Requires a MapTiler API key to enable Streets.",
      url: buildMapTilerStyleUrl("streets-v2"),
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &amp; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      requiresKey: true,
    },
    {
      id: "maptiler-outdoor",
      label: "MapTiler Outdoor",
      description: hasKey
        ? "Topographic outdoor style highlighting trails and elevation."
        : "Requires a MapTiler API key to enable Outdoor.",
      url: buildMapTilerStyleUrl("outdoor-v2"),
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &amp; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      requiresKey: true,
    },
    {
      id: "maptiler-ocean",
      label: "MapTiler Ocean",
      description: hasKey
        ? "Ocean-first basemap designed to complement marine overlays."
        : "Requires a MapTiler API key to enable Ocean.",
      url: buildMapTilerStyleUrl("ocean"),
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &amp; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      requiresKey: true,
    },
    {
      id: "maptiler-satellite",
      label: "MapTiler Satellite",
      description: hasKey
        ? "Hybrid satellite imagery with labels. Requires a MapTiler Pro plan for production use."
        : "Requires a MapTiler API key to enable Satellite.",
      url: buildMapTilerStyleUrl("hybrid", "jpg"),
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>, <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and <a href="https://www.maxar.com/">Maxar</a>',
      requiresKey: true,
      requiresPro: true,
    },
  ];
};

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
  const mapInstanceRef = useRef<L.Map | null>(null);
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
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const hasMapTilerKey = Boolean(mapTilerKey);
  const baseLayerSources = useMemo(() => createBaseLayerSources(), []);
  const defaultBaseLayerId = useMemo<BaseLayerKey>(() => {
    const preferred: BaseLayerKey = hasMapTilerKey ? "maptiler-outdoor" : "osm";
    const preferredLayer = baseLayerSources.find((layer) => layer.id === preferred && Boolean(layer.url));
    if (preferredLayer?.id) {
      return preferredLayer.id;
    }
    const fallbackLayer = baseLayerSources.find((layer) => layer.id === "osm" && Boolean(layer.url));
    if (fallbackLayer?.id) {
      return fallbackLayer.id;
    }
    return (baseLayerSources.find((layer) => Boolean(layer.url))?.id ?? "osm") as BaseLayerKey;
  }, [baseLayerSources, hasMapTilerKey]);
  const [activeBaseLayerId, setActiveBaseLayerId] = useState<BaseLayerKey>(defaultBaseLayerId);
  const activeBaseLayer = useMemo(() => {
    const selected = baseLayerSources.find((layer) => layer.id === activeBaseLayerId && Boolean(layer.url));
    if (selected) {
      return selected;
    }
    return baseLayerSources.find((layer) => layer.id === defaultBaseLayerId && Boolean(layer.url)) ??
      baseLayerSources.find((layer) => Boolean(layer.url)) ??
      baseLayerSources[0];
  }, [activeBaseLayerId, baseLayerSources, defaultBaseLayerId]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapTilerFeature[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
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
  const marineOverlaySources = useMemo(() => createMarineOverlaySources(), []);
  const marineOverlayEntries = useMemo(
    () => Object.entries(marineOverlaySources) as [MarineOverlayKey, MarineOverlaySource][],
    [marineOverlaySources],
  );
  const marineOverlayPanes = useMemo(() => {
    const seen = new Map<string, number>();
    marineOverlayEntries.forEach(([, overlay]) => {
      if (!seen.has(overlay.pane)) {
        seen.set(overlay.pane, overlay.zIndex);
      }
    });
    return Array.from(seen.entries());
  }, [marineOverlayEntries]);
  const initialMarineOverlayState = useMemo(() => {
    const state: Record<MarineOverlayKey, boolean> = {
      bathymetry: false,
      contours: false,
      labels: false,
    };
    marineOverlayEntries.forEach(([key, overlay]) => {
      state[key] = Boolean(overlay.url && overlay.defaultEnabled);
    });
    return state;
  }, [marineOverlayEntries]);
  const [marineOverlayVisibility, setMarineOverlayVisibility] =
    useState<Record<MarineOverlayKey, boolean>>(initialMarineOverlayState);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setActiveBaseLayerId((prev) => {
      const stillAvailable = baseLayerSources.find((layer) => layer.id === prev && Boolean(layer.url));
      if (stillAvailable) {
        return prev;
      }
      return defaultBaseLayerId;
    });
  }, [baseLayerSources, defaultBaseLayerId]);

  useEffect(() => {
    setMarineOverlayVisibility((prev) => {
      const next = { ...prev };
      marineOverlayEntries.forEach(([key, overlay]) => {
        if (!overlay.url) {
          next[key] = false;
          return;
        }
        if (!(key in next)) {
          next[key] = overlay.defaultEnabled;
        }
      });
      return next;
    });
  }, [marineOverlayEntries]);

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

  const toggleMarineOverlay = (overlay: MarineOverlayKey) => {
    setMarineOverlayVisibility((prev) => ({ ...prev, [overlay]: !prev[overlay] }));
  };

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    if (!mapTilerKey) {
      setSearchError("Add a MapTiler API key to enable location search.");
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const encoded = encodeURIComponent(searchQuery.trim());
      const response = await fetch(`https://api.maptiler.com/geocoding/${encoded}.json?key=${mapTilerKey}`);
      if (!response.ok) {
        throw new Error(`Geocoding request failed with status ${response.status}`);
      }
      const data = (await response.json()) as MapTilerGeocodingResponse;
      if (!isMountedRef.current) {
        return;
      }
      setSearchResults(data.features ?? []);
      if ((data.features ?? []).length === 0) {
        setSearchError("No results found for that search.");
      }
    } catch (error) {
      console.error("MapTiler geocoding error", error);
      if (!isMountedRef.current) {
        return;
      }
      setSearchError("We couldn't complete that search. Try again in a moment.");
      setSearchResults([]);
    } finally {
      if (isMountedRef.current) {
        setSearchLoading(false);
      }
    }
  };

  const handleSelectSearchResult = (feature: MapTilerFeature) => {
    const coordinates = feature.geometry?.coordinates ?? feature.center;
    if (!coordinates || coordinates.length < 2) {
      return;
    }
    const [longitude, latitude] = coordinates;
    const nextPosition: [number, number] = [latitude, longitude];
    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo(nextPosition, Math.max(map.getZoom(), 11), { duration: 1.2 });
    }
    setUserPosition(nextPosition);
    setSearchResults([]);
    setSearchQuery(feature.place_name ?? feature.text ?? searchQuery);
    setSearchError(null);
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
          <div className="absolute left-4 top-4 z-[401] w-full max-w-[320px] space-y-2">
            <form
              onSubmit={handleSearchSubmit}
              className="flex overflow-hidden rounded-2xl border border-white/15 bg-slate-900/80 text-sm text-white shadow backdrop-blur"
            >
              <span className="flex items-center justify-center px-3 text-white/70">
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (searchError) {
                    setSearchError(null);
                  }
                }}
                placeholder={mapTilerKey ? "Search for water, cities, or ramps" : "Add a MapTiler key to search"}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
                disabled={!mapTilerKey}
              />
              <button
                type="submit"
                className="px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/40"
                disabled={!mapTilerKey || searchLoading}
              >
                Go
              </button>
            </form>
            {searchError ? (
              <p className="rounded-xl bg-slate-900/70 px-3 py-2 text-xs text-amber-200 shadow">{searchError}</p>
            ) : null}
            {searchResults.length > 0 ? (
              <ul className="max-h-60 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/85 p-2 text-sm text-white shadow">
                {searchResults.map((feature) => {
                  const coordinates = feature.geometry?.coordinates ?? feature.center;
                  const isSelectable = Boolean(coordinates && coordinates.length >= 2);
                  const name = feature.place_name ?? feature.text ?? "Unnamed location";
                  return (
                    <li key={feature.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSearchResult(feature)}
                        disabled={!isSelectable}
                        className={clsx(
                          "w-full rounded-xl px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300",
                          isSelectable
                            ? "bg-white/5 text-white hover:bg-white/10"
                            : "cursor-not-allowed bg-white/5 text-white/40",
                        )}
                      >
                        <span className="block text-sm font-medium">{name}</span>
                        {feature.properties?.country || feature.properties?.region ? (
                          <span className="mt-0.5 block text-xs text-white/60">
                            {[feature.properties?.region, feature.properties?.country].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <MapContainer
            center={userPosition}
            zoom={11}
            scrollWheelZoom
            style={{ height: "480px", width: "100%" }}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
            whenCreated={(map) => {
              mapInstanceRef.current = map;
            }}
          >
            <MapRelocator position={userPosition} />
            <Pane name="base-tiles" style={{ zIndex: 200 }} />
            {marineOverlayPanes.map(([name, zIndex]) => (
              <Pane key={name} name={name} style={{ zIndex }} />
            ))}
            {activeBaseLayer?.url ? (
              <TileLayer pane="base-tiles" attribution={activeBaseLayer.attribution} url={activeBaseLayer.url} key={activeBaseLayer.id} />
            ) : null}
            {marineOverlayEntries.map(([key, overlay]) => {
              if (!overlay.url || !marineOverlayVisibility[key]) {
                return null;
              }
              return (
                <TileLayer
                  key={overlay.id}
                  pane={overlay.pane}
                  attribution={overlay.attribution}
                  url={overlay.url}
                  opacity={overlay.opacity ?? 1}
                />
              );
            })}
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
          <h2 className="text-lg font-semibold text-white">Base map</h2>
          <p className="text-sm text-white/60">Swap the foundational basemap to change context for your planning.</p>
          {!hasMapTilerKey ? (
            <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Add a MapTiler API key to unlock premium base maps and geocoding search.
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {baseLayerSources.map((layer) => {
              const available = Boolean(layer.url) && !layer.requiresPro;
              const isActive = activeBaseLayer?.id === layer.id && available;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => available && setActiveBaseLayerId(layer.id)}
                  disabled={!available}
                  className={clsx(
                    "w-full rounded-2xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300",
                    isActive
                      ? "border-brand-400 bg-brand-400/20 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                    !available && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{layer.label}</span>
                    {isActive ? <Check className="h-4 w-4" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-white/60">{layer.description}</p>
                  {!available && layer.requiresPro ? (
                    <p className="mt-1 text-xs text-amber-200">Requires a MapTiler Pro plan.</p>
                  ) : null}
                  {!available && layer.requiresKey && !hasMapTilerKey ? (
                    <p className="mt-1 text-xs text-amber-200">Add a MapTiler API key to enable this style.</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white">Marine layers</h2>
          <p className="text-sm text-white/60">
            Stack bathymetry, contour labels, and seamark overlays to plan routes without losing fishing spot context.
          </p>
          <div className="mt-4 space-y-3">
            {marineOverlayEntries.map(([key, overlay]) => {
              const available = Boolean(overlay.url);
              return (
                <div key={overlay.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <label
                    className={clsx("flex items-start gap-3", available ? "cursor-pointer" : "cursor-not-allowed")}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10"
                      checked={marineOverlayVisibility[key]}
                      onChange={() => toggleMarineOverlay(key)}
                      disabled={!available}
                    />
                    <span>
                      <span className="text-sm font-medium text-white">{overlay.label}</span>
                      <span className="mt-1 block text-xs text-white/60">{overlay.description}</span>
                      {!available && overlay.requiresKey ? (
                        <span className="mt-1 block text-xs text-amber-300">
                          Add a MapTiler API key to enable this overlay.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

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
