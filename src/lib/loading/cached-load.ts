import { useRef } from "react";
import { useDelayedLoad, type LoadPhase } from "./delayed-load.ts";
import { readTestLoadDelay, readTestLoadError, settleLoad } from "./test-delay.ts";

/** Seeded data shows at once. A dev/test delay is the only path that turns this into a skeleton. */
export function useCachedLoad<T>(data: T, cacheKey: string) {
  const ref = useRef(data);
  ref.current = data;
  const load = useDelayedLoad(() => settleLoad(ref.current), { cacheKey });
  const hooked = readTestLoadDelay() > 0 || readTestLoadError();
  if (!hooked) {
    return { phase: "ready" as LoadPhase, skeleton: false, error: false, value: data };
  }
  const phase: LoadPhase = load.phase;
  return {
    phase,
    skeleton: phase === "skeleton",
    error: phase === "error",
    value: phase === "ready" && load.data !== undefined ? load.data : data,
  };
}
