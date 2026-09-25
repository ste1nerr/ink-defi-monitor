type Entry<T> = { value: T; storedAt: number };

export type CachedResult<T> = { value: T; storedAt: number; stale: boolean };

/**
 * In-memory TTL cache with request deduplication and stale-while-revalidate:
 * - concurrent callers for the same key share one in-flight load;
 * - after `ttlMs` the stale value is returned immediately and refreshed in the background;
 * - after `maxStaleMs` callers wait for a fresh load;
 * - if a refresh fails, the last good value keeps being served (flagged stale).
 */
export class SwrCache {
  private entries = new Map<string, Entry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();

  async get<T>(
    key: string,
    load: () => Promise<T>,
    { ttlMs, maxStaleMs = ttlMs * 10 }: { ttlMs: number; maxStaleMs?: number },
  ): Promise<CachedResult<T>> {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    const age = entry ? Date.now() - entry.storedAt : Infinity;

    if (entry && age < ttlMs) return { ...entry, stale: false };

    if (entry && age < maxStaleMs) {
      this.refresh(key, load).catch(() => undefined);
      return { ...entry, stale: true };
    }

    try {
      const value = await this.refresh(key, load);
      return { value, storedAt: this.entries.get(key)!.storedAt, stale: false };
    } catch (error) {
      if (entry) return { ...entry, stale: true };
      throw error;
    }
  }

  private refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = load()
      .then((value) => {
        this.entries.set(key, { value, storedAt: Date.now() });
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}

export const cache = new SwrCache();
