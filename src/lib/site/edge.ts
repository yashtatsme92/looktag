/**
 * Host-agnostic edge rules for the Nitro server middleware
 * (`server/middleware/site-edge.ts`). Pure so they can be unit tested.
 */

type Env = Record<string, string | undefined>;

export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

function appOrigin(env: Env): URL | null {
  const raw = String(env.APP_URL ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Protocol the client used: first X-Forwarded-Proto, else the URL's own. */
export function requestProto(url: URL, forwardedProto: string | null): string {
  const fwd = String(forwardedProto ?? "").split(",")[0].trim().toLowerCase();
  return fwd || url.protocol.replace(":", "");
}

/** HSTS header value, or "" when it must not be sent. */
export function hstsHeader(env: Env, url: URL, forwardedProto: string | null): string {
  const app = appOrigin(env);
  if (!app || app.protocol !== "https:") return "";
  return requestProto(url, forwardedProto) === "https" ? HSTS_VALUE : "";
}

function hostOf(origin: string): string {
  try {
    return new URL(origin.trim()).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Optional canonical-host redirect (off unless SITE_REDIRECT_TO_CANONICAL=1).
 * Returns the 301 target, or "" to serve as-is. Auth routes on a
 * TRUSTED_ORIGINS host are never redirected so old-host sign-in and OAuth
 * callbacks keep working.
 */
export function canonicalRedirect(env: Env, url: URL, host: string): string {
  if (String(env.SITE_REDIRECT_TO_CANONICAL ?? "").trim() !== "1") return "";
  const app = appOrigin(env);
  if (!app) return "";
  const reqHost = String(host || url.host).split(",")[0].trim().toLowerCase();
  if (!reqHost || reqHost === app.host.toLowerCase()) return "";
  if (/^(localhost|127\.|\[::1\])/.test(reqHost)) return "";
  const trusted = String(env.TRUSTED_ORIGINS ?? "").split(",").map(hostOf).filter(Boolean);
  if (url.pathname.startsWith("/api/auth/") && trusted.includes(reqHost)) return "";
  if (url.pathname.startsWith("/api/")) return "";
  return `${app.origin}${url.pathname}${url.search}`;
}

/** Host for OG / manifest tags: APP_URL's host when set, else the request host. */
export function publicHost(env: Env, requestHost: string): string {
  const app = appOrigin(env);
  return app ? app.host : requestHost;
}
