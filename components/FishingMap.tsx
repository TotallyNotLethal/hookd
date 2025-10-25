"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { fishingSpots, FishingSpot } from "@/lib/fishingSpots";
import { Check, MapPin, ShieldAlert } from "lucide-react";

const DEFAULT_POSITION: [number, number] = [40.7989, -81.3784];

type SpeciesFilters = Record<string, boolean>;

const icon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
});

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

function buildSpeciesFilters(spots: FishingSpot[]): SpeciesFilters {
  const filters: SpeciesFilters = {};
  spots.forEach((spot) => {
    spot.species.forEach((species) => {
      filters[species] = true;
    });
  });
  return filters;
}

export default function FishingMap() {
  const [userPosition, setUserPosition] = useState<[number, number]>(DEFAULT_POSITION);
  const [speciesFilters, setSpeciesFilters] = useState<SpeciesFilters>(() => buildSpeciesFilters(fishingSpots));
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

  const activeSpecies = useMemo(() => Object.keys(speciesFilters).filter((key) => speciesFilters[key]), [speciesFilters]);

  const filteredSpots = useMemo(() => {
    if (activeSpecies.length === Object.keys(speciesFilters).length) {
      return fishingSpots;
    }
    return fishingSpots.filter((spot) => spot.species.some((species) => speciesFilters[species]));
  }, [activeSpecies.length, speciesFilters]);

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
          {filteredSpots.map((spot) => (
            <Marker key={spot.id} position={[spot.latitude, spot.longitude]} icon={icon}>
              <Popup>
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">{spot.name}</h3>
                  <p className="text-sm text-slate-600">{spot.regulations.description}</p>
                  {spot.latestCatch && (
                    <p className="text-sm">
                      Latest catch: <strong>{spot.latestCatch.species}</strong> ({spot.latestCatch.weight}) on {spot.latestCatch.bait}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">Target species: {spot.species.join(", ")}</p>
                </div>
              </Popup>
            </Marker>
          ))}
          {showRegulations && (
            <>
              {filteredSpots.map((spot) => (
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
            {Object.keys(speciesFilters).map((species) => {
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
            {sortedSpots.map((spot) => (
              <li key={spot.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{spot.name}</p>
                    <p className="text-xs uppercase tracking-wide text-white/50">{spot.distance} mi • {spot.species.slice(0, 2).join(", ")}</p>
                  </div>
                  <MapPin className="h-4 w-4 text-brand-300" />
                </div>
                <p className="mt-3 text-sm text-white/70">{spot.regulations.description}</p>
                <p className="mt-2 text-xs text-white/60">Bag limit: {spot.regulations.bagLimit}</p>
                {spot.latestCatch && (
                  <p className="mt-2 text-xs text-brand-200">
                    Recent catch: {spot.latestCatch.species} ({spot.latestCatch.weight}) on {spot.latestCatch.bait}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
