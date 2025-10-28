import "server-only";

export type TtlCacheOptions = {
  ttlMs: number;
  maxEntries: number;
};

type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

export class TtlCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();

  private readonly ttlMs: number;

  private readonly maxEntries: number;

  constructor({ ttlMs, maxEntries }: TtlCacheOptions) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be a positive number");
    }
    if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
      throw new Error("maxEntries must be a positive number");
    }
    this.ttlMs = ttlMs;
    this.maxEntries = Math.floor(maxEntries);
  }

  get(key: string): V | undefined {
    this.purgeExpired();
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlOverrideMs?: number) {
    const ttlMs = ttlOverrideMs && ttlOverrideMs > 0 ? ttlOverrideMs : this.ttlMs;
    const expiresAt = Date.now() + ttlMs;
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAt });
    this.pruneOverflow();
  }

  async getOrSet(key: string, factory: () => Promise<V>, ttlOverrideMs?: number): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = await factory();
    this.set(key, value, ttlOverrideMs);
    return value;
  }

  get size(): number {
    this.purgeExpired();
    return this.store.size;
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  private pruneOverflow() {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        break;
      }
      this.store.delete(oldestKey);
    }
  }
}
