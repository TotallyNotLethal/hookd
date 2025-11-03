"use client";

import { GeoPoint, Timestamp } from "firebase/firestore";

const CACHE_PREFIX = "hookd:cache:";
const TYPE_KEY = "__hookd_cache_type";
const TYPE_TIMESTAMP = "timestamp";
const TYPE_GEOPOINT = "geopoint";
const TYPE_DATE = "date";
const TYPE_MAP = "map";
const TYPE_SET = "set";

const DEFAULT_MAX_AGE_MS = 1000 * 60 * 15; // 15 minutes

type CacheEntry<T> = {
  timestamp: number;
  value: T;
};

type MaybeStorage = Storage | null;

export type CacheOptions = {
  maxAgeMs?: number;
};

function getStorage(): MaybeStorage {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const { localStorage } = window;
    if (!localStorage) {
      return null;
    }

    const testKey = `${CACHE_PREFIX}__test__`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return localStorage;
  } catch (error) {
    console.warn("Local cache is unavailable", error);
    return null;
  }
}

function serialize(value: unknown): string | null {
  try {
    return JSON.stringify(value, (_key, current) => {
      if (current instanceof Timestamp) {
        return {
          [TYPE_KEY]: TYPE_TIMESTAMP,
          seconds: current.seconds,
          nanoseconds: current.nanoseconds,
        };
      }

      if (current instanceof GeoPoint) {
        return {
          [TYPE_KEY]: TYPE_GEOPOINT,
          latitude: current.latitude,
          longitude: current.longitude,
        };
      }

      if (current instanceof Date) {
        return {
          [TYPE_KEY]: TYPE_DATE,
          value: current.toISOString(),
        };
      }

      if (current instanceof Map) {
        return {
          [TYPE_KEY]: TYPE_MAP,
          entries: Array.from(current.entries()),
        };
      }

      if (current instanceof Set) {
        return {
          [TYPE_KEY]: TYPE_SET,
          values: Array.from(current.values()),
        };
      }

      return current;
    });
  } catch (error) {
    console.warn("Failed to serialize cache entry", error);
    return null;
  }
}

function deserialize<T>(value: string): T | null {
  try {
    return JSON.parse(value, (_key, current) => {
      if (!current || typeof current !== "object" || !(TYPE_KEY in current)) {
        return current;
      }

      switch ((current as Record<string, unknown>)[TYPE_KEY]) {
        case TYPE_TIMESTAMP: {
          const seconds = Number((current as Record<string, unknown>).seconds);
          const nanoseconds = Number((current as Record<string, unknown>).nanoseconds);
          if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
            return new Timestamp(seconds, nanoseconds);
          }
          return current;
        }
        case TYPE_GEOPOINT: {
          const latitude = Number((current as Record<string, unknown>).latitude);
          const longitude = Number((current as Record<string, unknown>).longitude);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            return new GeoPoint(latitude, longitude);
          }
          return current;
        }
        case TYPE_DATE: {
          const iso = (current as Record<string, unknown>).value;
          return typeof iso === "string" ? new Date(iso) : current;
        }
        case TYPE_MAP: {
          const entries = (current as Record<string, unknown>).entries;
          return Array.isArray(entries) ? new Map(entries as any) : current;
        }
        case TYPE_SET: {
          const values = (current as Record<string, unknown>).values;
          return Array.isArray(values) ? new Set(values as any) : current;
        }
        default:
          return current;
      }
    }) as T;
  } catch (error) {
    console.warn("Failed to deserialize cache entry", error);
    return null;
  }
}

export function setCachedValue<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const entry: CacheEntry<T> = {
    timestamp: Date.now(),
    value,
  };

  const serialized = serialize(entry);
  if (!serialized) {
    return;
  }

  try {
    storage.setItem(CACHE_PREFIX + key, serialized);
  } catch (error) {
    console.warn("Failed to persist cache entry", key, error);
  }
}

export function getCachedValue<T>(key: string, options: CacheOptions = {}): T | null | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  const raw = storage.getItem(CACHE_PREFIX + key);
  if (!raw) {
    return undefined;
  }

  const entry = deserialize<CacheEntry<T> | null>(raw);
  if (!entry || typeof entry.timestamp !== "number") {
    storage.removeItem(CACHE_PREFIX + key);
    return undefined;
  }

  const maxAgeMs = typeof options.maxAgeMs === "number" && Number.isFinite(options.maxAgeMs)
    ? Math.max(0, options.maxAgeMs)
    : DEFAULT_MAX_AGE_MS;

  if (maxAgeMs > 0 && Date.now() - entry.timestamp > maxAgeMs) {
    storage.removeItem(CACHE_PREFIX + key);
    return undefined;
  }

  return entry.value;
}

export function primeCachedValue<T>(
  key: string,
  cb: (value: T) => void,
  options: CacheOptions = {},
): void {
  const cached = getCachedValue<T>(key, options);
  if (cached === undefined) {
    return;
  }

  try {
    cb(cached as T);
  } catch (error) {
    console.error("Failed to hydrate from cache", key, error);
  }
}

export function clearCachedValue(key: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(CACHE_PREFIX + key);
}
