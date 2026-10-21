import { useRef } from "react";
import { useDelayedLoad, type LoadPhase } from "./delayed-load.ts";

export type Deferred = { deferred: true };

/** Server renders with data. Client navigations resolve immediately and load in the page. */
export function clientDeferred<T>(load: () => Promise<T>): Promise<T | Deferred> {
  if (import.meta.env?.SSR) return load();
  return Promise.resolve({ deferred: true });
}

export function isDeferred(value: unknown): value is Deferred {
  return Boolean(value && typeof value === "object" && (value as Deferred).deferred === true);
}

/**
 * Seeded (SSR) data is ready on the first paint. A deferred client navigation
 * fetches here, so the route can paint a skeleton instead of blocking the previous page.
 */
export function useRouteLoad<T>(seeded: T | Deferred, cacheKey: string, load: () => Promise<T>) {
  const deferred = isDeferred(seeded);
  const seedRef = useRef<T | undefined>(deferred ? undefined : seeded);
  if (!deferred) seedRef.current = seeded;
  const snapshot = useDelayedLoad(load, {
    cacheKey,
    initial: deferred ? undefined : seedRef.current,
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
