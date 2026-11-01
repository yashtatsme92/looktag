/** Product requests vs telemetry writes share one embedded database. Writes wait. */

type Pressure = { active: number; waiters: Array<() => void> };

const KEY = "__looktagRequestPressure";

function slot(): Pressure {
  const g = globalThis as typeof globalThis & { [KEY]?: Pressure };
  g[KEY] ??= { active: 0, waiters: [] };
  return g[KEY];
}

export function beginProductRequest(): void {
  slot().active += 1;
}

export function endProductRequest(): void {
  const state = slot();
  state.active = Math.max(0, state.active - 1);
  if (state.active === 0) {
    const pending = state.waiters.splice(0, state.waiters.length);
    for (const wake of pending) wake();
  }
}

export function productRequestsActive(): boolean {
  return slot().active > 0;
}

export function whenProductIdle(): Promise<void> {
  if (slot().active === 0) return Promise.resolve();
  return new Promise((resolve) => {
    slot().waiters.push(resolve);
  });
}
