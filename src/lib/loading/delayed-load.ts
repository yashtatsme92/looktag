import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { loadingCache, type LoadCache } from "./cache.ts";

export type LoadPhase = "ready" | "waiting" | "skeleton" | "error";

export type DelayedLoadSnapshot<T> = {
  phase: LoadPhase;
  data?: T;
  error?: unknown;
  scrollY?: number | null;
};

export type DelayedLoadOptions = {
  cacheKey?: string;
  delayMs?: number;
  minSkeletonMs?: number;
  timeoutMs?: number;
  cache?: LoadCache;
};

export type DelayedLoadController<T> = {
  start(): void;
  getSnapshot(): DelayedLoadSnapshot<T>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export function createDelayedLoad<T>(
  load: () => Promise<T>,
  options: DelayedLoadOptions = {},
): DelayedLoadController<T> {
  const delayMs = options.delayMs ?? 300;
  const minSkeletonMs = options.minSkeletonMs ?? 400;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const cache = options.cache;
  const cached = options.cacheKey ? cache?.get<T>(options.cacheKey) : undefined;
  let snapshot: DelayedLoadSnapshot<T> = cached
    ? { phase: "ready", data: cached.value, scrollY: cached.scrollY }
    : { phase: "waiting" };
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let minTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let skeletonStartedAt: number | undefined;
  let started = false;
  let disposed = false;
  let request = 0;
  const listeners = new Set<() => void>();

  function publish(next: DelayedLoadSnapshot<T>) {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function clearTimers() {
    clearTimeout(delayTimer);
    clearTimeout(minTimer);
    clearTimeout(timeoutTimer);
  }

  function cacheValue(value: T) {
    if (options.cacheKey) cache?.set(options.cacheKey, value);
  }

  function start() {
    if (started || disposed) return;
    started = true;
    if (options.cacheKey) {
      const currentCache = cache?.get<T>(options.cacheKey);
      if (currentCache) {
        publish({ phase: "ready", data: currentCache.value, scrollY: currentCache.scrollY });
        return;
      }
    }

    const currentRequest = ++request;
    timeoutTimer = setTimeout(() => {
      if (currentRequest !== request || disposed) return;
      clearTimers();
      request += 1;
      publish({ phase: "error", error: new Error("Loading timed out") });
    }, timeoutMs);
    delayTimer = setTimeout(() => {
      if (currentRequest !== request || disposed) return;
      skeletonStartedAt = Date.now();
      publish({ phase: "skeleton" });
    }, delayMs);

    Promise.resolve()
      .then(load)
      .then((data) => {
        if (currentRequest !== request || disposed) return;
        clearTimeout(delayTimer);
        clearTimeout(timeoutTimer);
        cacheValue(data);
        if (skeletonStartedAt === undefined) {
          publish({ phase: "ready", data });
          return;
        }
        const remaining = Math.max(0, minSkeletonMs - (Date.now() - skeletonStartedAt));
        if (remaining === 0) {
          publish({ phase: "ready", data });
          return;
        }
        minTimer = setTimeout(() => {
          if (currentRequest === request) publish({ phase: "ready", data });
        }, remaining);
      })
      .catch((error: unknown) => {
        if (currentRequest !== request || disposed) return;
        clearTimers();
        publish({ phase: "error", error });
      });
  }

  return {
    start,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      if (snapshot.phase === "ready" && snapshot.data !== undefined && options.cacheKey) {
        const scrollY = typeof window === "undefined" ? snapshot.scrollY : window.scrollY;
        cache?.set(options.cacheKey, snapshot.data, scrollY);
      }
      disposed = true;
      request += 1;
      clearTimers();
      listeners.clear();
    },
  };
}

export function useDelayedLoad<T>(
  load: () => Promise<T>,
  options: DelayedLoadOptions = {},
): DelayedLoadSnapshot<T> {
  const { cacheKey, delayMs, minSkeletonMs, timeoutMs } = options;
  const loadRef = useRef(load);
  loadRef.current = load;
  const controller = useMemo(
    () =>
      createDelayedLoad(() => loadRef.current(), {
        cacheKey,
        delayMs,
        minSkeletonMs,
        timeoutMs,
        cache: typeof window === "undefined" ? undefined : options.cache ?? loadingCache,
      }),
    [cacheKey, delayMs, minSkeletonMs, timeoutMs, options.cache],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    if (snapshot.phase === "ready" && snapshot.scrollY != null && typeof window !== "undefined") {
      window.scrollTo({ top: snapshot.scrollY, behavior: "instant" });
    }
  }, [snapshot.phase, snapshot.scrollY]);

  return snapshot;
}
