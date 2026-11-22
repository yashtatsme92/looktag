import { posthogInitConfig } from "./config.ts";
import { shouldLoadAnalytics } from "./consent.ts";
import {
  analyticsIsBound,
  bindAnalytics,
  type AnalyticsClient,
} from "./runtime.ts";

let bootPromise: Promise<boolean> | null = null;

/** Test hook. Production boot keeps one in-flight load. */
export function resetAnalyticsBoot(): void {
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
  bootPromise = (async () => {
    try {
      const loaded = await input.load();
      loaded.init(input.key.trim(), posthogInitConfig(true));
      bindAnalytics(loaded);
      return true;
    } catch {
      bootPromise = null;
      bindAnalytics(null);
      return false;
    }
  })();
  return bootPromise;
}
