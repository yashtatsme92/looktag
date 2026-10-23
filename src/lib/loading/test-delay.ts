/**
 * Dev-only delay hooks. The `import.meta.env.DEV` checks are direct so the
 * production build constant-folds them and drops the storage keys entirely.
 */
export function readTestLoadDelay(): number {
  if (import.meta.env.DEV) {
    if (typeof window === "undefined") return 0;
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("loadDelay") || sessionStorage.getItem("looktag-load-delay") || "";
      const value = Number(raw);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function readTestLoadError(): boolean {
  if (import.meta.env.DEV) {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("looktag-load-error") === "1" || new URLSearchParams(window.location.search).get("loadError") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

/** Resolves with the same value. A test delay holds it; a test error flag rejects. Real rejections pass through. */
export async function settleLoad<T>(value: T | Promise<T>): Promise<T> {
  if (import.meta.env.DEV && readTestLoadError()) throw new Error("Couldn't load this.");
  const result = await value;
  if (import.meta.env.DEV) {
    const delay = readTestLoadDelay();
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return result;
}
