import { appVersion } from "../build-info";
import { useSettingsStore } from "../settings/store";
import { bootAnalytics } from "./boot";
import { readBootFromDocument, mirrorConsentCache } from "../consent/client";
import { consentView } from "../consent/policy";
import { enabledFeedFeatures, surfaceFrom } from "./context";
import { configureAnalytics } from "./runtime";

function pageConsent(): string | null {
  if (typeof document === "undefined") return null;
  const view = consentView(readBootFromDocument());
  mirrorConsentCache(view.load ? "granted" : view.effectiveValue === "denied" ? "denied" : null);
  return view.load ? "granted" : null;
}

function readSurface() {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { standalone?: boolean });
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches === true || nav?.standalone === true);
  return surfaceFrom({ width, standalone });
}

/** Reads shared props. Does not load PostHog. */
export function installAnalyticsReaders(): void {
  configureAnalytics({
    appVersion,
    surface: readSurface,
    feedFeatures: () => enabledFeedFeatures(useSettingsStore.getState()),
  });
}

/**
 * Dynamic import keeps posthog-js out of the main bundle.
 * Called only after the key and lt_consent=granted both pass.
 */
export function bootAnalyticsFromEnv(): Promise<boolean> {
  const key = String(import.meta.env.VITE_POSTHOG_KEY ?? "").trim();
  return bootAnalytics({
    key,
    consent: pageConsent(),
    load: async () => {
      const mod = await import("posthog-js");
      const posthog = mod.default;
      return {
        init(token, config) {
          posthog.init(token, config as Parameters<typeof posthog.init>[1]);
        },
        capture(event, props) {
          posthog.capture(event, props);
        },
        identify(id) {
          posthog.identify(id);
        },
        reset() {
          posthog.reset();
        },
        optOut() {
          posthog.opt_out_capturing();
        },
        optIn() {
          posthog.opt_in_capturing();
        },
      };
    },
  });
}
