import { FEED_FEATURES, type FeedFeatureKey } from "../home/engagement.ts";

const ENUMS = {
  source: new Set(["save", "publish", "save_draft", "follow", "you", "find_pieces", "admin"]),
  method: new Set(["google", "email"]),
  from: new Set(["feed", "house", "share", "deeplink"]),
  result: new Set(["ok", "gated", "unavailable", "quota"]),
  channel: new Set(["copy", "native", "sheet"]),
  to: new Set(["for_you", "following"]),
  surface: new Set(["phone", "tablet", "desktop", "pwa"]),
} as const;

const FEED_KEYS = new Set<string>(FEED_FEATURES.map((feature) => feature.key));

export type AllowedProps = Record<string, string | boolean>;

function forbiddenValue(value: string): boolean {
  if (value.includes("@")) return true;
  if (/https?:\/\//i.test(value) || value.startsWith("//")) return true;
  if (/^www\./i.test(value)) return true;
  return false;
}

function feedFeaturesValue(raw: string): string {
  const picked = new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => FEED_KEYS.has(part)),
  );
  return FEED_FEATURES.filter((feature) => picked.has(feature.key)).map((feature) => feature.key).join(",");
}

/**
 * Keep only allowlisted keys and closed values.
 * Drops emails, names, handles, free text, prices, and URLs.
 */
export function allowProps(input: Record<string, unknown> | undefined): AllowedProps {
  const out: AllowedProps = {};
  if (!input) return out;
  for (const [key, raw] of Object.entries(input)) {
    if (key === "signed_in") {
      if (typeof raw === "boolean") out.signed_in = raw;
      continue;
    }
    if (typeof raw !== "string") continue;
    if (forbiddenValue(raw) && key !== "feed_features") continue;
    if (key === "look_id") {
      if (/^[A-Za-z0-9_-]{1,80}$/.test(raw)) out.look_id = raw;
      continue;
    }
    if (key === "app_version") {
      if (/^[0-9]+(\.[0-9]+){1,3}$/.test(raw)) out.app_version = raw;
      continue;
    }
    if (key === "feed_features") {
      out.feed_features = feedFeaturesValue(raw);
      continue;
    }
    const allowed = ENUMS[key as keyof typeof ENUMS];
    if (allowed?.has(raw as never)) out[key] = raw;
  }
  return out;
}

export function isFeedFeatureKey(value: string): value is FeedFeatureKey {
  return FEED_KEYS.has(value);
}
