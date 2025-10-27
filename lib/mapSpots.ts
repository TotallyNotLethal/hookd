import { fishingSpots, type FishingSpot } from "@/lib/fishingSpots";
import type { CatchWithCoordinates } from "@/lib/firestore";

export const MATCH_DISTANCE_MILES = 0.5;
export const MATCH_DISTANCE_METERS = MATCH_DISTANCE_MILES * 1609.34;

export const USER_REPORTED_REGULATIONS: FishingSpot["regulations"] = {
  description: "User reported location. Verify public access and regulations before fishing.",
  bagLimit: "Check local authorities for current limits.",
};

export type SpeciesFilters = Record<string, boolean>;

export type SpotCatchSummary = {
  id?: string;
  species: string;
  weight?: string | null;
  bait?: string | null;
  displayName?: string | null;
  occurredAt?: Date | null;
  source: "dynamic" | "static";
};

export type SpotPin = {
  id: string;
  latitude: number;
  longitude: number;
};

export type MapSpot = {
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

export type LeaderboardEntry = {
  species: string;
  rankings: {
    id: string;
    displayName: string;
    weightLabel: string;
    weightValue: number;
  }[];
};

export function computeDistanceMiles(
  a: [number, number],
  b: [number, number],
): number {
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
  const occurredAt = catchDoc.capturedAtDate ?? catchDoc.createdAtDate ?? null;
  return {
    id: catchDoc.id,
    species: catchDoc.species,
    weight: catchDoc.weight ?? null,
    displayName: catchDoc.displayName ?? null,
    occurredAt,
    source: "dynamic",
  };
}

export function buildSpeciesFilters(spots: MapSpot[]): SpeciesFilters {
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

export function aggregateSpots(
  baseSpots: FishingSpot[],
  catches: CatchWithCoordinates[],
): MapSpot[] {
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
    const aDate = a.capturedAtDate ?? a.createdAtDate ?? null;
    const bDate = b.capturedAtDate ?? b.createdAtDate ?? null;
    const aTime = aDate ? aDate.getTime() : 0;
    const bTime = bDate ? bDate.getTime() : 0;
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
      if (catchDoc.species) {
        matchedBucket.speciesSet.add(catchDoc.species);
      }
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
    if (catchDoc.species) {
      targetBucket.speciesSet.add(catchDoc.species);
    }
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

export function catchBelongsToStaticSpot(
  spot: MapSpot,
  catchDoc: CatchWithCoordinates,
): boolean {
  if (!catchDoc.coordinates) return false;
  const catchPosition: [number, number] = [catchDoc.coordinates.lat, catchDoc.coordinates.lng];
  return computeDistanceMiles([spot.latitude, spot.longitude], catchPosition) <= MATCH_DISTANCE_MILES;
}

export function getSpotCatches(
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

export function buildLeaderboards(catches: CatchWithCoordinates[]): LeaderboardEntry[] {
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
}

export function ensureSpeciesFilters(existing?: SpeciesFilters): SpeciesFilters {
  const filters = existing ? { ...existing } : {};
  const aggregated = aggregateSpots(fishingSpots, []);
  aggregated.forEach((spot) => {
    spot.species.forEach((species) => {
      if (!(species in filters)) {
        filters[species] = true;
      }
    });
  });
  return filters;
}
