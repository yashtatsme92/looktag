const DELAY_KEY = "looktag-load-delay";
const ERROR_KEY = "looktag-load-error";

function testHooksEnabled() {
  return Boolean(import.meta.env?.DEV);
}

/** Test-only. E2E sets sessionStorage or `?loadDelay=` so a surface can miss the 300ms window. */
export function readTestLoadDelay(): number {
  if (!testHooksEnabled() || typeof window === "undefined") return 0;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("loadDelay") || sessionStorage.getItem(DELAY_KEY) || "";
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function readTestLoadError(): boolean {
  if (!testHooksEnabled() || typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ERROR_KEY) === "1" || new URLSearchParams(window.location.search).get("loadError") === "1";
  } catch {
    return false;
  }
}

/** Resolves with the same value. A test delay holds it; a test error flag rejects. Real rejections pass through. */
export async function settleLoad<T>(value: T | Promise<T>): Promise<T> {
  if (readTestLoadError()) throw new Error("Couldn't load this.");
  const result = await value;
  const delay = readTestLoadDelay();
  if (!delay) return result;
  await new Promise((resolve) => setTimeout(resolve, delay));
  return result;
}
