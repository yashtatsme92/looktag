export const CREATOR_FOLLOWS_KEY = "looktag-followed-creators-v1";
export const HOUSE_FOLLOWS_KEY = "looktag-followed-houses-v1";
export const FEED_LESS_KEY = "looktag-feed-less-v1";
export const FOLLOWING_SEEN_KEY = "looktag-following-seen-v1";
export const FEED_AUDIT_KEY = "looktag-feed-audit-v1";
export const FEED_VISIT_KEY = "looktag-feed-visit-v1";
export const FEED_DIVIDER_SEEN_KEY = "looktag-feed-divider-v1";

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

/** Guests may follow. A signed-in shopper cannot follow their own creator id. */
export function viewerCanFollow(viewerId: string | null | undefined, creatorId: string): boolean {
  if (!creatorId) return false;
  if (!viewerId) return true;
  return viewerId !== creatorId;
}

/** Drop the viewer's own id. Other creators stay. */
export function omitSelfFollow(ids: readonly string[], viewerId: string | null | undefined): string[] {
  if (!viewerId) return ids.slice();
  return ids.filter((id) => id !== viewerId);
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

/** True once per browser session, and only after an earlier visit. */
export function consumeFreshVisit(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const previous = localStorage.getItem(FEED_VISIT_KEY);
    const shown = sessionStorage.getItem(FEED_DIVIDER_SEEN_KEY);
    localStorage.setItem(FEED_VISIT_KEY, String(Date.now()));
    if (!previous || shown) return false;
    sessionStorage.setItem(FEED_DIVIDER_SEEN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
