'use client';

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebaseClient';
import type { EnvironmentBands, EnvironmentSnapshot } from './environmentTypes';
import type { Coordinates } from './location';

const SIGNAL_TTL_MS = 60 * 60 * 1000;
const MAX_CATCH_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CATCH_SAMPLES = 250;

export type BiteSliceStats = {
  weight: number;
  samples: number;
};

export type BitePredictionDirection = 'up' | 'flat' | 'down';

export type BitePrediction = {
  offsetHours: number;
  label: string;
  direction: BitePredictionDirection;
  confidence: number;
  environment: EnvironmentSnapshot;
  bands: EnvironmentBands;
  sampleWeight: number;
  sampleSize: number;
};

export type BiteSignalDocument = {
  locationKey: string;
  sampleSize: number;
  totalWeight: number;
  matrix: Record<string, BiteSliceStats>;
  predictions: BitePrediction[];
  insufficient: boolean;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  centroid?: { lat: number; lng: number } | null;
};

type CatchDocument = {
  uid?: string;
  userId?: string;
  captureNormalizedAt?: Timestamp | null;
  environmentBands?: EnvironmentBands | null;
  coordinates?: { latitude?: number; longitude?: number } | { lat?: number; lng?: number } | null;
};

type EnvironmentSlice = {
  offsetHours: number;
  timestampUtc: string;
  snapshot: EnvironmentSnapshot;
};

const userTrustCache = new Map<string, number>();

function buildSliceKey(bands: EnvironmentBands) {
  return `${bands.timeOfDay}|${bands.moonPhase}|${bands.pressure}`;
}

async function getUserTrust(uid: string): Promise<number> {
  if (!uid) return 1;
  if (userTrustCache.has(uid)) {
    return userTrustCache.get(uid)!;
  }
  try {
    const profileSnap = await getDoc(doc(db, 'users', uid));
    let trust = 1;
    if (profileSnap.exists()) {
      const data = profileSnap.data() as any;
      if (data?.isPro) {
        trust += 0.5;
      }
      if (Array.isArray(data?.trophies) && data.trophies.length > 0) {
        trust += 0.25;
      }
    }
    userTrustCache.set(uid, trust);
    return trust;
  } catch (error) {
    console.warn('Unable to load user trust score', error);
    return 1;
  }
}

function resolveCoordinates(value: CatchDocument['coordinates']): { lat: number; lng: number } | null {
  if (!value) return null;
  if ('latitude' in value && typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { lat: value.latitude, lng: value.longitude };
  }
  if ('lat' in value && typeof value.lat === 'number' && typeof value.lng === 'number') {
    return { lat: value.lat, lng: value.lng };
  }
  return null;
}

async function fetchEnvironmentSlices(
  coordinates: Coordinates,
  forwardHours: number,
): Promise<EnvironmentSlice[] | null> {
  try {
    const params = new URLSearchParams({
      lat: coordinates.lat.toString(),
      lng: coordinates.lng.toString(),
      forwardHours: String(forwardHours),
    });
    const response = await fetch(`/api/environment?${params.toString()}`);
    if (response.status >= 400 && response.status < 500) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Environment endpoint failed with status ${response.status}`);
    }
    const body = await response.json();
    const slices: EnvironmentSlice[] = Array.isArray(body?.slices)
      ? body.slices
      : [];
    return slices.slice(0, forwardHours + 1);
  } catch (error) {
    console.warn('Unable to fetch environment slices for predictions', error);
    return null;
  }
}

function computePrediction(
  bands: EnvironmentBands,
  environment: EnvironmentSnapshot,
  matrix: Map<string, BiteSliceStats>,
  totalWeight: number,
  totalSamples: number,
): Omit<BitePrediction, 'offsetHours' | 'label'> {
  const key = buildSliceKey(bands);
  const entry = matrix.get(key);
  if (!entry || entry.samples === 0 || totalWeight <= 0 || totalSamples <= 0) {
    return {
      direction: 'flat',
      confidence: 0,
      environment,
      bands,
      sampleWeight: 0,
      sampleSize: 0,
    };
  }

  const sliceWeightPerSample = entry.weight / entry.samples;
  const globalWeightPerSample = totalWeight / totalSamples;
  const relative = globalWeightPerSample > 0 ? sliceWeightPerSample / globalWeightPerSample : 1;

  let direction: BitePredictionDirection = 'flat';
  if (relative >= 1.25) {
    direction = 'up';
  } else if (relative <= 0.75) {
    direction = 'down';
  }

  const sampleRatio = entry.samples / totalSamples;
  const weightRatio = entry.weight / totalWeight;
  const baseConfidence = Math.min(1, sampleRatio * 0.6 + weightRatio * 0.4);
  const directionalStrength = Math.min(1, Math.abs(relative - 1));
  const confidence = direction === 'flat'
    ? baseConfidence * (1 - directionalStrength * 0.5)
    : baseConfidence * (0.6 + directionalStrength * 0.4);

  return {
    direction,
    confidence: Math.min(1, Math.max(0, confidence)),
    environment,
    bands,
    sampleWeight: entry.weight,
    sampleSize: entry.samples,
  };
}

async function recomputeBiteSignal(
  locationKey: string,
  coordinates: Coordinates | null,
): Promise<BiteSignalDocument | null> {
  const q = query(
    collection(db, 'catches'),
    where('locationKey', '==', locationKey),
    limit(MAX_CATCH_SAMPLES),
  );
  const snap = await getDocs(q);
  const cutoff = Date.now() - MAX_CATCH_LOOKBACK_MS;

  const matrix = new Map<string, BiteSliceStats>();
  let totalWeight = 0;
  let sampleSize = 0;
  let centroid = coordinates ?? null;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as CatchDocument & { environmentSnapshot?: EnvironmentSnapshot | null };
    const normalized = data.captureNormalizedAt;
    const normalizedMillis = normalized instanceof Timestamp ? normalized.toMillis() : null;
    if (!normalizedMillis || normalizedMillis < cutoff) {
      continue;
    }
    if (!data.environmentBands) {
      continue;
    }

    const uid = typeof data.uid === 'string' && data.uid
      ? data.uid
      : typeof data.userId === 'string'
        ? data.userId
        : '';
    const trust = await getUserTrust(uid);

    const key = buildSliceKey(data.environmentBands);
    const existing = matrix.get(key);
    if (existing) {
      existing.weight += trust;
      existing.samples += 1;
    } else {
      matrix.set(key, { weight: trust, samples: 1 });
    }
    totalWeight += trust;
    sampleSize += 1;

    if (!centroid) {
      const coords = resolveCoordinates(data.coordinates ?? null);
      if (coords) {
        centroid = coords;
      }
    }
  }

  const matrixObject: Record<string, BiteSliceStats> = {};
  matrix.forEach((value, key) => {
    matrixObject[key] = value;
  });

  const updatedAt = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(Date.now() + SIGNAL_TTL_MS);

  const slices = centroid ? await fetchEnvironmentSlices(centroid, 3) : null;
  const predictions: BitePrediction[] = [];
  if (slices && slices.length > 0) {
    for (const slice of slices.slice(0, 3)) {
      const bands: EnvironmentBands = {
        timeOfDay: slice.snapshot.timeOfDayBand,
        moonPhase: slice.snapshot.moonPhaseBand,
        pressure: slice.snapshot.pressureBand,
      };
      const base = computePrediction(bands, slice.snapshot, matrix, totalWeight, sampleSize);
      const label = slice.offsetHours === 0 ? 'Now' : `+${slice.offsetHours}h`;
      predictions.push({
        offsetHours: slice.offsetHours,
        label,
        ...base,
      });
    }
  }

  const insufficient = sampleSize < 5 || predictions.every((prediction) => prediction.confidence < 0.25);

  return {
    locationKey,
    sampleSize,
    totalWeight,
    matrix: matrixObject,
    predictions,
    insufficient,
    updatedAt,
    expiresAt,
    centroid: centroid ? { lat: centroid.lat, lng: centroid.lng } : null,
  };
}

export async function refreshBiteSignalForCatch({
  locationKey,
  coordinates,
}: {
  locationKey: string;
  coordinates?: Coordinates | null;
}): Promise<void> {
  try {
    const signal = await recomputeBiteSignal(locationKey, coordinates ?? null);
    if (!signal) return;
    await setDoc(doc(db, 'biteSignals', locationKey), signal);
  } catch (error) {
    console.warn('Unable to refresh bite signal', error);
  }
}

export async function getOrRefreshBiteSignal({
  locationKey,
  coordinates,
}: {
  locationKey: string;
  coordinates?: Coordinates | null;
}): Promise<BiteSignalDocument | null> {
  const ref = doc(db, 'biteSignals', locationKey);
  const snap = await getDoc(ref);
  const now = Date.now();
  let existing: BiteSignalDocument | null = null;
  if (snap.exists()) {
    const data = snap.data() as BiteSignalDocument;
    existing = {
      ...data,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
      expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt : Timestamp.now(),
    };
    if (existing.expiresAt.toMillis() > now) {
      return existing;
    }
  }

  if (!coordinates) {
    return existing;
  }

  const refreshed = await recomputeBiteSignal(locationKey, coordinates);
  if (!refreshed) {
    return existing;
  }
  await setDoc(ref, refreshed);
  return refreshed;
}
