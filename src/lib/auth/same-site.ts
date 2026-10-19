import { bearerFromHeaders } from "./native.ts";

/**
 * Pure Fetch-Metadata sibling-isolation decision (see `isolation.server.ts`).
 *
 * Bearer-token requests are exempt: the token is not an ambient credential, so a
 * sibling site cannot ride it the way it can a `SameSite=Lax` cookie (and
 * `verify.server.ts` authenticates them by token only, never by cookie).
 * The cookie path stays strict.
 */
export function isSameSiteAllowed(headers: Headers, method: string): boolean {
  if (bearerFromHeaders(headers)) return true;
  const site = headers.get("sec-fetch-site");
  // Non-browser client (no header), the app's own origin, or a direct load.
  if (!site || site === "same-origin" || site === "none") return true;
  // Top-level GET navigation (e.g. the OAuth callback redirect).
  const dest = headers.get("sec-fetch-dest");
  return (
    headers.get("sec-fetch-mode") === "navigate" &&
    method === "GET" &&
    dest !== "object" &&
    dest !== "embed"
  );
}
