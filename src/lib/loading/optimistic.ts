import { useRef, useSyncExternalStore } from "react";

export type OptimisticPhase = "idle" | "saving" | "saved" | "error";

type OptimisticSnapshot = { phase: OptimisticPhase; error: string | null };

/**
 * The control flips before `write` resolves. A newer write supersedes an older one.
 * Failure reverts that write. "Saved" clears after `savedMs` (1.5s) plus the 150ms fade.
 */
export function createOptimisticSave(savedMs = 1500) {
  let phase: OptimisticPhase = "idle";
  let error: string | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: OptimisticSnapshot = { phase, error };
  const listeners = new Set<() => void>();

  function publish() {
    snapshot = { phase, error };
    for (const listener of listeners) listener();
  }

  return {
    get phase() {
      return phase;
    },
    get error() {
      return error;
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async run<T>(write: () => Promise<T>, revert: () => void, apply?: (value: T) => void) {
      const token = ++generation;
      if (timer) clearTimeout(timer);
      phase = "saving";
      error = null;
      publish();
      try {
        const value = await write();
        if (token !== generation) return;
        apply?.(value);
        phase = "saved";
        publish();
        timer = setTimeout(() => {
          if (token !== generation) return;
          phase = "idle";
          publish();
        }, savedMs + 150);
      } catch (caught) {
        if (token !== generation) return;
        revert();
        phase = "error";
        error = caught instanceof Error ? caught.message : "Could not save.";
        publish();
      }
    },
  };
}

export function useOptimisticSave(savedMs = 1500) {
  const ref = useRef<ReturnType<typeof createOptimisticSave> | null>(null);
  if (!ref.current) ref.current = createOptimisticSave(savedMs);
  const controller = ref.current;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { phase: snapshot.phase, error: snapshot.error, run: controller.run.bind(controller) };
}
