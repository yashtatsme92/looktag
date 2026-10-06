export const CREATOR_FOLLOWS_KEY = "looktag-followed-creators-v1";
export const HOUSE_FOLLOWS_KEY = "looktag-followed-houses-v1";
export const FEED_LESS_KEY = "looktag-feed-less-v1";
export const FOLLOWING_SEEN_KEY = "looktag-following-seen-v1";
export const FEED_AUDIT_KEY = "looktag-feed-audit-v1";

export type FeedAudit = Record<string, { by: string; at: number }>;

export function readStoredIds(key: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeStoredIds(key: string, ids: readonly string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // private mode
  }
}

export function toggleStoredId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function resetFeedTuning() {
  try {
    localStorage.removeItem(FEED_LESS_KEY);
    localStorage.removeItem(FOLLOWING_SEEN_KEY);
  } catch {
    // private mode
  }
}

export function readFeedAudit(): FeedAudit {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(FEED_AUDIT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as FeedAudit;
  } catch {
    return {};
  }
}

export function writeFeedAudit(audit: FeedAudit) {
  try {
    localStorage.setItem(FEED_AUDIT_KEY, JSON.stringify(audit));
  } catch {
    // private mode
  }
}
