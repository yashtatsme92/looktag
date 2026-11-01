/**
 * Client-side canonical URLs for share / copy-link. Uses APP_URL (served by
 * `getSiteConfig`) once loaded, so a page opened on an old host still copies
 * the canonical address. Falls back to the current origin (local dev, previews).
 */
let cachedOrigin = "";

export function setPublicOrigin(origin: string) {
  cachedOrigin = String(origin || "").replace(/\/+$/, "");
}

export function publicOrigin(): string {
  if (cachedOrigin) return cachedOrigin;
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function publicUrl(path: string): string {
  return `${publicOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
