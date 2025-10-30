import 'server-only';

import { queryRegulations, type RegulationQueryOptions, REGULATIONS_DATASET_VERSION } from '../regulationsStore';
import { TtlCache } from './ttlCache';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const cache = new TtlCache<{ items: ReturnType<typeof queryRegulations>; version: string }>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

function buildCacheKey(options: RegulationQueryOptions): string {
  const normalizedRegion = options.region?.toLowerCase().trim() ?? '';
  const normalizedSpecies = options.species?.toLowerCase().trim() ?? '';
  return `${normalizedRegion}::${normalizedSpecies}`;
}

export async function getRegulationsPayload(options: RegulationQueryOptions = {}) {
  const key = buildCacheKey(options);
  return cache.getOrSet(key, async () => ({
    items: queryRegulations(options),
    version: REGULATIONS_DATASET_VERSION,
  }));
}
