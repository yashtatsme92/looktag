/**
 * One in-flight promise per key. A second caller while the first is pending
 * shares that promise instead of starting another server function.
 * Settled results are kept so Back and a second mount reuse them.
 */
const inflight = new Map<string, Promise<unknown>>();
const settled = new Map<string, unknown>();

function remember(): boolean {
  if (typeof window !== "undefined") return true;
  // The server must not keep one visitor's payload for the next request.
  return import.meta.env?.SSR !== true;
}

export function memoPromise<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!remember()) return load();
  if (settled.has(key)) return Promise.resolve(settled.get(key) as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const next = load().then(
    (value) => {
      settled.set(key, value);
      inflight.delete(key);
      return value;
    },
    (error: unknown) => {
      inflight.delete(key);
      throw error;
    },
  );
  inflight.set(key, next);
  return next;
}

/** Tests reset between cases. Production never calls this. */
export function resetMemoPromise() {
  inflight.clear();
  settled.clear();
}

/** Remember a value the server already rendered so Back does not refetch it. */
export function primeMemo<T>(key: string, value: T) {
  if (!remember()) return;
  if (settled.has(key) || inflight.has(key)) return;
  settled.set(key, value);
}
