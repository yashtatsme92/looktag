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

/**
 * Report-only CSP. Not enforced. Covers what the browser already loads:
 * self, Google fonts, img.thelooktag.com, Google and Apple sign-in, PostHog EU.
 * img-src includes https: so retailer images are not broken if this is enforced later.
 * script-src includes unsafe-inline for the boot script until that script is hashed.
 */
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://appleid.apple.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://img.thelooktag.com https:",
  "connect-src 'self' https://accounts.google.com https://appleid.apple.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://eu.posthog.com",
  "frame-src 'self' https://accounts.google.com https://appleid.apple.com",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

