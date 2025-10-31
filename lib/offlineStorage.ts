/* eslint-disable @typescript-eslint/no-explicit-any */
export type CatchQueueItem = {
  id: string;
  userId: string;
  method: 'POST' | 'PATCH';
  catchId?: string;
  payload: Record<string, any>;
  queuedAt: number;
  baseUpdatedAt?: string | null;
  previousSnapshot?: Record<string, any> | null;
  attempts: number;
  lastError?: string | null;
};

export type ForecastQueueItem = {
  id: string;
  latitude: number;
  longitude: number;
  locationLabel?: string | null;
  queuedAt: number;
  attempts: number;
};

export type OfflineQueueState = {
  catchCount: number;
  forecastCount: number;
  lastUpdated: number;
};

type QueueListener = (state: OfflineQueueState) => void;

const DB_NAME = 'hookd-offline-cache';
const DB_VERSION = 1;
const CATCH_STORE = 'catchQueue';
const FORECAST_STORE = 'forecastQueue';

const inMemoryCatch = new Map<string, CatchQueueItem>();
const inMemoryForecast = new Map<string, ForecastQueueItem>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
const listeners = new Set<QueueListener>();

const hasIndexedDb = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

async function emitState() {
  const state = await getOfflineQueueState();
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.error('offlineStorage listener error', error);
    }
  });
}

function migrateToMemory(storeName: string, data: any[]) {
  if (storeName === CATCH_STORE) {
    data.forEach((entry) => inMemoryCatch.set(entry.id, entry));
  } else if (storeName === FORECAST_STORE) {
    data.forEach((entry) => inMemoryForecast.set(entry.id, entry));
  }
  void emitState();
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb) {
    return null;
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CATCH_STORE)) {
          db.createObjectStore(CATCH_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(FORECAST_STORE)) {
          db.createObjectStore(FORECAST_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        console.warn('Falling back to in-memory offline storage', request.error);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

async function getStoreEntries<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  if (!db) {
    if (storeName === CATCH_STORE) return Array.from(inMemoryCatch.values()) as T[];
    if (storeName === FORECAST_STORE) return Array.from(inMemoryForecast.values()) as T[];
    return [];
  }
  return new Promise<T[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => {
      resolve(request.result as T[]);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function putStoreEntry<T extends { id: string }>(storeName: string, value: T): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    if (storeName === CATCH_STORE) {
      inMemoryCatch.set(value.id, value as CatchQueueItem);
      void emitState();
      return;
    }
    if (storeName === FORECAST_STORE) {
      inMemoryForecast.set(value.id, value as ForecastQueueItem);
      void emitState();
      return;
    }
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  void emitState();
}

async function deleteStoreEntry(storeName: string, id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    if (storeName === CATCH_STORE) {
      inMemoryCatch.delete(id);
    } else if (storeName === FORECAST_STORE) {
      inMemoryForecast.delete(id);
    }
    void emitState();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  void emitState();
}

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  void emitState();
  return () => {
    listeners.delete(listener);
  };
}

export async function getOfflineQueueState(): Promise<OfflineQueueState> {
  const [catchEntries, forecastEntries] = await Promise.all([
    getStoreEntries<CatchQueueItem>(CATCH_STORE),
    getStoreEntries<ForecastQueueItem>(FORECAST_STORE),
  ]);
  return {
    catchCount: catchEntries.length,
    forecastCount: forecastEntries.length,
    lastUpdated: Date.now(),
  };
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

export type QueueCatchOptions = {
  userId: string;
  method: 'POST' | 'PATCH';
  catchId?: string;
  payload: Record<string, any>;
  baseUpdatedAt?: string | null;
  previousSnapshot?: Record<string, any> | null;
};

export async function queueCatch(options: QueueCatchOptions): Promise<CatchQueueItem> {
  const entry: CatchQueueItem = {
    id: generateId('catch'),
    userId: options.userId,
    method: options.method,
    catchId: options.catchId,
    payload: options.payload,
    queuedAt: Date.now(),
    baseUpdatedAt: options.baseUpdatedAt ?? null,
    previousSnapshot: options.previousSnapshot ?? null,
    attempts: 0,
  };
  await putStoreEntry(CATCH_STORE, entry);
  return entry;
}

export type QueueForecastOptions = {
  latitude: number;
  longitude: number;
  locationLabel?: string | null;
};

export async function queueForecastRequest(options: QueueForecastOptions): Promise<ForecastQueueItem> {
  const entry: ForecastQueueItem = {
    id: generateId('forecast'),
    latitude: options.latitude,
    longitude: options.longitude,
    locationLabel: options.locationLabel ?? null,
    queuedAt: Date.now(),
    attempts: 0,
  };
  await putStoreEntry(FORECAST_STORE, entry);
  return entry;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeConflict(
  previous: Record<string, any> | null | undefined,
  localPatch: Record<string, any>,
  server: Record<string, any>
): Record<string, any> {
  const merged: Record<string, any> = {};
  const keys = new Set([
    ...Object.keys(localPatch ?? {}),
    ...Object.keys(previous ?? {}),
    ...Object.keys(server ?? {}),
  ]);
  keys.forEach((key) => {
    const localValue = localPatch?.[key];
    const previousValue = previous?.[key];
    const serverValue = server?.[key];

    if (localValue && typeof localValue === 'object' && !Array.isArray(localValue)) {
      merged[key] = mergeConflict(
        typeof previousValue === 'object' && previousValue ? previousValue : {},
        localValue,
        typeof serverValue === 'object' && serverValue ? serverValue : {}
      );
      return;
    }

    const serverChanged = JSON.stringify(serverValue) !== JSON.stringify(previousValue);
    const localChanged = JSON.stringify(localValue) !== JSON.stringify(previousValue);

    if (serverChanged && localChanged) {
      if (typeof localValue === 'string' && typeof serverValue === 'string' && localValue !== serverValue) {
        merged[key] = `${localValue}\n\n— Server version —\n${serverValue}`;
      } else {
        merged[key] = localValue;
      }
    } else if (serverChanged && !localChanged) {
      merged[key] = serverValue;
    } else if (localChanged) {
      merged[key] = localValue;
    } else {
      merged[key] = serverValue ?? localValue ?? previousValue ?? null;
    }
  });
  return merged;
}

const API_BASE = typeof window !== 'undefined' ? '' : 'http://localhost';

async function fetchCatchRecord(catchId: string, token: string): Promise<Record<string, any> | null> {
  const response = await fetch(`${API_BASE}/api/catches/${catchId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as Record<string, any>;
}

export type CatchSyncResult = {
  synced: number;
  conflicts: number;
  errors: number;
};

export async function syncQueuedCatches(options: {
  userId: string;
  getAuthToken: () => Promise<string>;
}): Promise<CatchSyncResult> {
  const entries = await getStoreEntries<CatchQueueItem>(CATCH_STORE);
  const userEntries = entries.filter((entry) => entry.userId === options.userId);
  if (!userEntries.length) {
    return { synced: 0, conflicts: 0, errors: 0 };
  }

  let synced = 0;
  let conflicts = 0;
  let errors = 0;

  for (const entry of userEntries) {
    try {
      const token = await options.getAuthToken();
      let payload = deepClone(entry.payload);

      if (entry.method === 'PATCH' && entry.catchId && entry.baseUpdatedAt) {
        try {
          const serverRecord = await fetchCatchRecord(entry.catchId, token);
          if (serverRecord?.updatedAt) {
            const serverUpdatedAt = new Date(serverRecord.updatedAt).getTime();
            const baseUpdatedAt = new Date(entry.baseUpdatedAt).getTime();
            if (Number.isFinite(serverUpdatedAt) && Number.isFinite(baseUpdatedAt) && serverUpdatedAt > baseUpdatedAt) {
              payload = mergeConflict(entry.previousSnapshot ?? {}, payload, serverRecord);
              conflicts += 1;
            }
          }
        } catch (error) {
          console.warn('Conflict resolution lookup failed', error);
        }
      }

      const url = entry.method === 'POST' ? `${API_BASE}/api/catches` : `${API_BASE}/api/catches/${entry.catchId}`;
      const response = await fetch(url, {
        method: entry.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }

      await deleteStoreEntry(CATCH_STORE, entry.id);
      synced += 1;
    } catch (error) {
      errors += 1;
      const next: CatchQueueItem = { ...entry, attempts: entry.attempts + 1, lastError: error instanceof Error ? error.message : 'Unknown error' };
      await putStoreEntry(CATCH_STORE, next);
    }
  }

  return { synced, conflicts, errors };
}

export async function syncQueuedForecastRequests(): Promise<number> {
  const entries = await getStoreEntries<ForecastQueueItem>(FORECAST_STORE);
  if (!entries.length) return 0;
  let synced = 0;
  for (const entry of entries) {
    try {
      const url = `${API_BASE}/api/forecasts/${entry.latitude}/${entry.longitude}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Forecast sync failed (${response.status})`);
      }
      await deleteStoreEntry(FORECAST_STORE, entry.id);
      synced += 1;
    } catch (error) {
      const next: ForecastQueueItem = { ...entry, attempts: entry.attempts + 1 };
      await putStoreEntry(FORECAST_STORE, next);
    }
  }
  return synced;
}

export async function loadOfflineState(): Promise<void> {
  if (!hasIndexedDb) {
    const [catchEntries, forecastEntries] = await Promise.all([
      getStoreEntries<CatchQueueItem>(CATCH_STORE),
      getStoreEntries<ForecastQueueItem>(FORECAST_STORE),
    ]);
    migrateToMemory(CATCH_STORE, catchEntries);
    migrateToMemory(FORECAST_STORE, forecastEntries);
  }
}

export async function resetOfflineStorageForTests(): Promise<void> {
  inMemoryCatch.clear();
  inMemoryForecast.clear();
  void emitState();
}
