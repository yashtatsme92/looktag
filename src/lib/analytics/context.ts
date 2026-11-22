import { FEED_FEATURES, type FeedFeatureKey } from "../home/engagement.ts";

export type AnalyticsSurface = "phone" | "tablet" | "desktop" | "pwa";

/** phone < 768, tablet < 1024, else desktop. Standalone display wins as pwa. */
export function surfaceFrom(input: { width: number; standalone: boolean }): AnalyticsSurface {
  if (input.standalone) return "pwa";
  if (input.width < 768) return "phone";
  if (input.width < 1024) return "tablet";
  return "desktop";
}

/** Comma-separated Admin feed toggles that are currently on. Not free text. */
export function enabledFeedFeatures(settings: Partial<Record<FeedFeatureKey, boolean>>): string {
  return FEED_FEATURES.filter((feature) => settings[feature.key] === true)
    .map((feature) => feature.key)
    .join(",");
}
