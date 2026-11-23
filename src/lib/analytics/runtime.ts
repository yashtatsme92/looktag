import { allowProps } from "./allowlist.ts";
import type { AnalyticsSurface } from "./context.ts";
import { isAnalyticsEvent, type AnalyticsEvent } from "./events.ts";

export type AnalyticsClient = {
  init: (token: string, config: object) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string) => void;
  reset: () => void;
  optOut?: () => void;
  optIn?: () => void;
};

let client: AnalyticsClient | null = null;
let signedIn = false;
let appVersion = "";
let surfaceReader: () => AnalyticsSurface = () => "desktop";
let feedFeaturesReader: () => string = () => "";

export function bindAnalytics(next: AnalyticsClient | null): void {
  client = next;
}

export function analyticsIsBound(): boolean {
  return client !== null;
}

export function setAnalyticsSignedIn(value: boolean): void {
  signedIn = value;
}

export function configureAnalytics(input: {
  appVersion?: string;
  surface?: () => AnalyticsSurface;
  feedFeatures?: () => string;
}): void {
  if (input.appVersion !== undefined) appVersion = input.appVersion;
  if (input.surface) surfaceReader = input.surface;
  if (input.feedFeatures) feedFeaturesReader = input.feedFeatures;
}

/** No-ops until PostHog is loaded. Unknown keys never leave this function. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!client || !isAnalyticsEvent(event)) return;
  const safe = allowProps({
    surface: surfaceReader(),
    signed_in: signedIn,
    app_version: appVersion,
    feed_features: feedFeaturesReader(),
    ...props,
  });
  client.capture(event, safe);
}

/** Internal user id only. Emails, names, and URLs are dropped. */
export function identify(userId: string): void {
  if (!client) return;
  const id = userId.trim();
  if (!id || id.includes("@") || id.includes("://") || /\s/.test(id) || id.length > 128) return;
  client.identify(id);
}

export function resetAnalytics(): void {
  signedIn = false;
  client?.reset();
}

/** Stop a loaded client and drop the binding so a later grant can boot again. */
export function withdrawAnalytics(): void {
  client?.optOut?.();
  client?.reset();
  bindAnalytics(null);
}

export function resetAnalyticsForTests(): void {
  client = null;
  signedIn = false;
  appVersion = "";
  surfaceReader = () => "desktop";
  feedFeaturesReader = () => "";
}
