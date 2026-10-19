import { useRef } from "react";
import { useDelayedLoad, type LoadPhase } from "./delayed-load.ts";
import { settleLoad } from "./test-delay.ts";

/** Seeded data shows at once. A slow `settleLoad` (test delay or a real wait) is the only path to a skeleton. */
export function useCachedLoad<T>(data: T, cacheKey: string) {
  const ref = useRef(data);
  ref.current = data;
  const load = useDelayedLoad(() => settleLoad(ref.current), { cacheKey });
  const phase: LoadPhase = load.phase;
  return {
    phase,
    skeleton: phase === "skeleton",
    error: phase === "error",
    value: phase === "ready" && load.data !== undefined ? load.data : data,
  };
}
