/**
 * One in-flight promise per key. A second caller while the first is pending
 * shares that promise instead of starting another server function.
 * Settled results are kept so Back and a second mount reuse them.
 */
const inflight = new Map<string, Promise<unknown>>();
const settled = new Map<string, unknown>();

export function memoPromise<T>(key: string, load: () => Promise<T>): Promise<T> {
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
