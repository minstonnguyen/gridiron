// Tiny in-process TTL cache for hot, slow-changing reads (teams, schedules, ratings, player basics).
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const TTL = { teams: 60 * 60_000, schedule: 5 * 60_000, ratings: 10 * 60_000, players: 10 * 60_000, short: 60_000 };

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fn()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function clearCache(): void {
  store.clear();
}
