import { useRef } from "react";
import { loadingCache } from "./cache.ts";
import { useDelayedLoad, type LoadPhase } from "./delayed-load.ts";
import { readPageScroll, writePageScroll } from "./page-scroll.ts";

export type Deferred = { deferred: true };

/** Server renders with data. A warm cache returns the saved value so Back paints content, not a skeleton. A cold client navigation stays on the previous page until this promise settles; the route's pendingComponent covers the wait after 300ms. */
export function clientDeferred<T>(load: () => Promise<T>, cacheKey?: string): Promise<T | Deferred> {
  if (import.meta.env?.SSR) return load();
  if (cacheKey && typeof window !== "undefined") {
    const hit = loadingCache.get<T>(cacheKey);
    if (hit) return Promise.resolve(hit.value);
  }
  return load().then((value) => {
    if (cacheKey && typeof window !== "undefined" && !loadingCache.get(cacheKey)) {
      loadingCache.set(cacheKey, value, 0);
    }
    return value;
  });
}

export function isDeferred(value: unknown): value is Deferred {
  return Boolean(value && typeof value === "object" && (value as Deferred).deferred === true);
}

/**
 * Seeded (SSR) data is ready on the first paint. A deferred client navigation
 * fetches here, so the route can paint a skeleton instead of blocking the previous page.
 * Scroll is the page scroller: `.native-main` on the phone, the window on the web.
 */
export function useRouteLoad<T>(seeded: T | Deferred, cacheKey: string, load: () => Promise<T>) {
  const deferred = isDeferred(seeded);
  const seedRef = useRef<T | undefined>(deferred ? undefined : seeded);
  if (!deferred) seedRef.current = seeded;
  const snapshot = useDelayedLoad(load, {
    cacheKey,
    initial: deferred ? undefined : seedRef.current,
    getScroll: readPageScroll,
    setScroll: writePageScroll,
  });
  if (!deferred) {
    return {
      phase: "ready" as LoadPhase,
      skeleton: false,
      error: false,
      waiting: false,
      data: seeded,
    };
  }
  return {
    phase: snapshot.phase,
    skeleton: snapshot.phase === "skeleton",
    error: snapshot.phase === "error",
    waiting: snapshot.phase === "waiting",
    data: snapshot.phase === "ready" ? snapshot.data : undefined,
  };
}
