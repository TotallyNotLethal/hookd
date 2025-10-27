import {
  Timestamp,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebaseClient';
import type { CatchTackle } from './firestore';

export type SeasonKey = 'spring' | 'summer' | 'fall' | 'winter';

export type TackleStatsEntry = {
  key: string;
  lureType: string;
  color?: string | null;
  rigging?: string | null;
  notesSample?: string | null;
  totalCatches: number;
  trophyCount: number;
  catchRate: number;
  trophyRate: number;
  lastCaughtAt?: Timestamp | null;
  speciesCounts: Record<string, number>;
  seasonCounts: Record<SeasonKey, number>;
};

export type UserTackleStats = {
  uid: string;
  totalCatches: number;
  entries: TackleStatsEntry[];
  favorites: string[];
  updatedAt?: Timestamp | null;
};

const SEASON_ORDER: SeasonKey[] = ['spring', 'summer', 'fall', 'winter'];

function normalizeValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildTackleKey(tackle: CatchTackle): string {
  const parts = [tackle.lureType.toLowerCase()];
  if (tackle.color) {
    parts.push(tackle.color.toLowerCase());
  }
  if (tackle.rigging) {
    parts.push(tackle.rigging.toLowerCase());
  }
  return parts.join('::');
}

function seasonFromDate(date: Date): SeasonKey {
  const month = date.getUTCMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

type UpdateUserTackleStatsParams = {
  uid: string;
  catchId: string;
  tackle: CatchTackle;
  species?: string | null;
  trophy: boolean;
  capturedAt?: Date | null;
};

function cloneSeasonCounts(source?: Record<string, number>): Record<SeasonKey, number> {
  const target: Record<SeasonKey, number> = { spring: 0, summer: 0, fall: 0, winter: 0 };
  if (!source) {
    return target;
  }
  for (const key of Object.keys(source)) {
    if (SEASON_ORDER.includes(key as SeasonKey)) {
      target[key as SeasonKey] = Number(source[key]) || 0;
    }
  }
  return target;
}

function cloneSpeciesCounts(source?: Record<string, number>): Record<string, number> {
  const target: Record<string, number> = {};
  if (!source) {
    return target;
  }
  Object.keys(source).forEach((key) => {
    if (!key) return;
    target[key] = Number(source[key]) || 0;
  });
  return target;
}

export async function updateUserTackleStatsForCatch({
  uid,
  catchId: _catchId,
  tackle,
  species,
  trophy,
  capturedAt,
}: UpdateUserTackleStatsParams): Promise<void> {
  if (!uid || !tackle?.lureType) {
    return;
  }

  const ref = doc(db, 'userTackleStats', uid);
  const capturedDate = capturedAt ?? new Date();
  const capturedTimestamp = Timestamp.fromDate(capturedDate);
  const normalizedSpecies = normalizeValue(species ?? '') || null;
  const seasonKey = seasonFromDate(capturedDate);
  const tackleKey = buildTackleKey(tackle);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists() ? (snapshot.data() as UserTackleStats) : null;
    const currentEntries = Array.isArray(existing?.entries) ? existing!.entries : [];
    const entries = currentEntries.map((entry) => ({ ...entry }));
    const totalPrior = existing?.totalCatches ?? 0;
    const nextTotal = totalPrior + 1;

    const entryIndex = entries.findIndex((entry) => entry.key === tackleKey);
    let entry: TackleStatsEntry;

    if (entryIndex >= 0) {
      entry = {
        ...entries[entryIndex],
        speciesCounts: cloneSpeciesCounts(entries[entryIndex].speciesCounts),
        seasonCounts: cloneSeasonCounts(entries[entryIndex].seasonCounts),
      };
    } else {
      entry = {
        key: tackleKey,
        lureType: tackle.lureType,
        color: tackle.color ?? null,
        rigging: tackle.rigging ?? null,
        notesSample: tackle.notes ?? null,
        totalCatches: 0,
        trophyCount: 0,
        catchRate: 0,
        trophyRate: 0,
        lastCaughtAt: null,
        speciesCounts: {},
        seasonCounts: { spring: 0, summer: 0, fall: 0, winter: 0 },
      };
    }

    entry.totalCatches += 1;
    if (trophy) {
      entry.trophyCount += 1;
    }
    entry.lastCaughtAt = capturedTimestamp;
    entry.lureType = tackle.lureType;
    entry.color = tackle.color ?? null;
    entry.rigging = tackle.rigging ?? null;
    entry.notesSample = tackle.notes ?? entry.notesSample ?? null;

    if (normalizedSpecies) {
      entry.speciesCounts[normalizedSpecies] = (entry.speciesCounts[normalizedSpecies] ?? 0) + 1;
    }
    entry.seasonCounts[seasonKey] = (entry.seasonCounts[seasonKey] ?? 0) + 1;

    entry.trophyRate = entry.totalCatches ? entry.trophyCount / entry.totalCatches : 0;

    if (entryIndex >= 0) {
      entries[entryIndex] = entry;
    } else {
      entries.push(entry);
    }

    const recalculatedEntries = entries.map((item) => ({
      ...item,
      catchRate: item.totalCatches ? item.totalCatches / nextTotal : 0,
      trophyRate: item.totalCatches ? item.trophyCount / item.totalCatches : 0,
    }));

    const sortedEntries = recalculatedEntries.sort((a, b) => {
      if (b.trophyRate !== a.trophyRate) {
        return b.trophyRate - a.trophyRate;
      }
      if (b.totalCatches !== a.totalCatches) {
        return b.totalCatches - a.totalCatches;
      }
      return (b.lastCaughtAt?.toMillis() ?? 0) - (a.lastCaughtAt?.toMillis() ?? 0);
    });

    const limitedEntries = sortedEntries.slice(0, 50);
    const favorites = limitedEntries
      .slice(0, 5)
      .map((entryItem) => entryItem.key);

    transaction.set(
      ref,
      {
        uid,
        totalCatches: nextTotal,
        entries: limitedEntries,
        favorites,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export function subscribeToUserTackleStats(
  uid: string,
  callback: (stats: UserTackleStats | null) => void,
): () => void {
  if (!uid) {
    callback(null);
    return () => {};
  }

  const ref = doc(db, 'userTackleStats', uid);
  return onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback(snapshot.data() as UserTackleStats);
  });
}

export const SEASON_LABELS: Record<SeasonKey, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};
