import { posthogInitConfig } from "./config.ts";
import { shouldLoadAnalytics } from "./consent.ts";
import {
  analyticsIsBound,
  bindAnalytics,
  type AnalyticsClient,
} from "./runtime.ts";

let bootPromise: Promise<boolean> | null = null;
/** Bumped on withdraw so a load that finishes after opt-out cannot bind. */
let bootEpoch = 0;

/** Test hook. Production boot keeps one in-flight load. */
export function resetAnalyticsBoot(): void {
  bootEpoch += 1;
  bootPromise = null;
}

/**
 * Load the analytics client only when the key and consent both pass.
 * Does not call fetch. The SDK, once loaded, talks to /ingest itself.
 */
export async function bootAnalytics(input: {
  key: string;
  consent: string | null | undefined;
  load: () => Promise<AnalyticsClient>;
}): Promise<boolean> {
  if (!shouldLoadAnalytics(input.key, input.consent)) return false;
  if (analyticsIsBound()) return true;
  if (bootPromise) return bootPromise;
  const epoch = bootEpoch;
  bootPromise = (async () => {
    try {
      const loaded = await input.load();
      if (epoch !== bootEpoch) return false;
      loaded.init(input.key.trim(), posthogInitConfig(true));
      loaded.optIn?.();
      if (epoch !== bootEpoch) {
        if (!analyticsIsBound()) {
          loaded.optOut?.();
          loaded.reset();
        }
        return false;
      }
      bindAnalytics(loaded);
      return true;
    } catch {
      if (epoch === bootEpoch) {
        bootPromise = null;
        bindAnalytics(null);
      }
      return false;
    }
  })();
  return bootPromise;
}
