/**
 * Host-agnostic edge rules (#183), driven only by env:
 * - Strict-Transport-Security on HTTPS responses when APP_URL is https.
 * - Content-Security-Policy-Report-Only (not enforced).
 * - Optional 301 to the APP_URL host when SITE_REDIRECT_TO_CANONICAL=1
 *   (auth routes on TRUSTED_ORIGINS hosts are exempt).
 * Plain-HTTP to HTTPS upgrades are the host edge's job (see docs/DEPLOY-DOMAIN.md).
 */
import { CSP_REPORT_ONLY, canonicalRedirect, hstsHeader } from "../../src/lib/site/edge";
import { NOT_FOUND_HEADER } from "../../src/lib/share-meta";

interface EdgeEvent {
  url: URL;
  req: { method: string; headers: Headers };
  res?: { headers?: Headers };
}

const CSP_HEADER = "content-security-policy-report-only";

function applyHeaders(result: unknown, extra: Record<string, string>): unknown {
  if (!(result instanceof Response) || Object.keys(extra).length === 0) return result;
  const missing = Object.entries(extra).filter(([name]) => name && !result.headers.has(name));
  if (missing.length === 0) return result;
  try {
    for (const [name, value] of missing) result.headers.set(name, value);
    return result;
  } catch {
    const headers = new Headers(result.headers);
    for (const [name, value] of missing) headers.set(name, value);
    return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
  }
}

export default async function siteEdgeMiddleware(
  event: EdgeEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const env = process.env;
  const host = event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
  const hsts = hstsHeader(env, event.url, event.req.headers.get("x-forwarded-proto"));
  const extra: Record<string, string> = { [CSP_HEADER]: CSP_REPORT_ONLY };
  if (hsts) extra["strict-transport-security"] = hsts;
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    const target = canonicalRedirect(env, event.url, host);
    if (target) {
      const headers = new Headers({ location: target, "cache-control": "public, max-age=3600", ...extra });
      return new Response(null, { status: 301, headers });
    }
  }
  if (hsts) event.res?.headers?.set("strict-transport-security", hsts);
  event.res?.headers?.set(CSP_HEADER, CSP_REPORT_ONLY);
  let result = await next();
  if (result instanceof Response && result.headers.has(NOT_FOUND_HEADER)) {
    const headers = new Headers(result.headers);
    headers.delete(NOT_FOUND_HEADER);
    result = new Response(result.body, { status: 404, statusText: "Not Found", headers });
  }
  return applyHeaders(result, extra);
}
