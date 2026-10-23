import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { loadingCache, type LoadCache } from "./cache.ts";

export type LoadPhase = "ready" | "waiting" | "skeleton" | "error";

export type DelayedLoadSnapshot<T> = {
  phase: LoadPhase;
  data?: T;
  error?: unknown;
  scrollY?: number | null;
};

export type DelayedLoadOptions<T = unknown> = {
  cacheKey?: string;
  delayMs?: number;
  minSkeletonMs?: number;
  timeoutMs?: number;
  cache?: LoadCache;
  /** Defaults to window.scrollY. Surfaces with an inner scroller pass their own. */
  getScroll?: () => number | null;
  setScroll?: (scrollY: number) => void;
  /** Already-known data (SSR). Skips the wait so the first paint matches the server. */
  initial?: T;
  /**
   * When false, this load does not listen for scroll and does not restore it.
   * The phone feed owns its scroller itself so a tab switch cannot replay
   * another surface's position. Defaults to true.
   */
  trackScroll?: boolean;
};

export type DelayedLoadController<T> = {
  start(): void;
  getSnapshot(): DelayedLoadSnapshot<T>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export function createDelayedLoad<T>(
  load: () => Promise<T>,
  options: DelayedLoadOptions<T> = {},
): DelayedLoadController<T> {
  const delayMs = options.delayMs ?? 300;
  const minSkeletonMs = options.minSkeletonMs ?? 400;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const cache = options.cache;
  const cached = options.cacheKey ? cache?.get<T>(options.cacheKey) : undefined;
  let snapshot: DelayedLoadSnapshot<T> = cached
    ? { phase: "ready", data: cached.value, scrollY: cached.scrollY }
    : options.initial !== undefined
      ? { phase: "ready", data: options.initial }
      : { phase: "waiting" };
  if (!cached && options.initial !== undefined && options.cacheKey) {
    cache?.set(options.cacheKey, options.initial);
  }
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let minTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let skeletonStartedAt: number | undefined;
  let started = false;
  let request = 0;
  const listeners = new Set<() => void>();

  function publish(next: DelayedLoadSnapshot<T>) {
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
    if (started) return;
    started = true;
    if (snapshot.phase === "ready") return;
    if (options.cacheKey) {
      const currentCache = cache?.get<T>(options.cacheKey);
      if (currentCache) {
        publish({ phase: "ready", data: currentCache.value, scrollY: currentCache.scrollY });
        return;
      }
    }

    const currentRequest = ++request;
    timeoutTimer = setTimeout(() => {
      if (currentRequest !== request) return;
      clearTimers();
      request += 1;
      publish({ phase: "error", error: new Error("Loading timed out") });
    }, timeoutMs);
    delayTimer = setTimeout(() => {
      if (currentRequest !== request) return;
      skeletonStartedAt = Date.now();
      publish({ phase: "skeleton" });
    }, delayMs);

    Promise.resolve()
      .then(load)
      .then((data) => {
        if (currentRequest !== request) return;
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
        if (currentRequest !== request) return;
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
      if (
        options.trackScroll !== false &&
        snapshot.phase === "ready" &&
        snapshot.data !== undefined &&
        options.cacheKey
      ) {
        const live = options.getScroll
          ? options.getScroll()
          : typeof window === "undefined"
            ? (snapshot.scrollY ?? null)
            : window.scrollY;
        const previous = cache?.get<T>(options.cacheKey)?.scrollY ?? null;
        const scrollY = live != null && live > 1 ? live : previous != null && previous > 1 ? previous : live;
        cache?.set(options.cacheKey, snapshot.data, scrollY);
      }
      request += 1;
      started = false;
      if (snapshot.phase !== "ready") snapshot = { phase: "waiting" };
      clearTimers();
      listeners.clear();
    },
  };
}

/** Starts on mount. Screens that already know they are pending should render Skeleton instead. */
const scrollSavers = new Set<() => void>();
let scrollListening = false;
let scrollFrame = 0;

function ensureScrollListener() {
  if (scrollListening || typeof window === "undefined") return;
  scrollListening = true;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        for (const save of scrollSavers) save();
      });
    },
    { capture: true, passive: true },
  );
}

export function useDelayedLoad<T>(
  load: () => Promise<T>,
  options: DelayedLoadOptions<T> = {},
): DelayedLoadSnapshot<T> {
  const { cacheKey, delayMs, minSkeletonMs, timeoutMs } = options;
  const loadRef = useRef(load);
  loadRef.current = load;
  const getScrollRef = useRef(options.getScroll);
  const setScrollRef = useRef(options.setScroll);
  getScrollRef.current = options.getScroll;
  setScrollRef.current = options.setScroll;
  const initialRef = useRef(options.initial);
  initialRef.current = options.initial;
  const hasInitial = options.initial !== undefined;
  const trackScroll = options.trackScroll !== false;
  const controller = useMemo(
    () =>
      createDelayedLoad(() => loadRef.current(), {
        cacheKey,
        delayMs,
        minSkeletonMs,
        timeoutMs,
        cache: typeof window === "undefined" ? undefined : options.cache ?? loadingCache,
        initial: hasInitial ? initialRef.current : undefined,
        trackScroll,
        getScroll: () => {
          if (getScrollRef.current) return getScrollRef.current();
          return typeof window === "undefined" ? null : window.scrollY;
        },
      }),
    [cacheKey, delayMs, minSkeletonMs, timeoutMs, options.cache, hasInitial, trackScroll],
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

  useLayoutEffect(() => {
    if (!trackScroll) return;
    if (snapshot.phase !== "ready" || snapshot.scrollY == null || typeof window === "undefined") return;
    if (setScrollRef.current) setScrollRef.current(snapshot.scrollY);
    else window.scrollTo({ top: snapshot.scrollY, behavior: "instant" });
  }, [snapshot.phase, snapshot.scrollY, trackScroll]);

  const dataRef = useRef(snapshot.data);
  dataRef.current = snapshot.data;
  useEffect(() => {
    if (!trackScroll || snapshot.phase !== "ready" || !cacheKey || typeof window === "undefined") return;
    const cache = options.cache ?? loadingCache;
    const save = () => {
      const value = dataRef.current;
      if (value === undefined) return;
      const y = getScrollRef.current ? getScrollRef.current() : window.scrollY;
      const previous = cache.get<T>(cacheKey)?.scrollY ?? null;
      if ((y == null || y <= 1) && previous != null && previous > 1) return;
      cache.set(cacheKey, value, y);
    };
    scrollSavers.add(save);
    ensureScrollListener();
    return () => {
      scrollSavers.delete(save);
    };
  }, [snapshot.phase, cacheKey, options.cache, trackScroll]);

  return snapshot;
}
