/**
 * Host-agnostic edge rules (#183), driven only by env:
 * - Strict-Transport-Security on HTTPS responses when APP_URL is https.
 * - Optional 301 to the APP_URL host when SITE_REDIRECT_TO_CANONICAL=1
 *   (auth routes on TRUSTED_ORIGINS hosts are exempt).
 * Plain-HTTP → HTTPS upgrades are the host edge's job (see docs/DEPLOY-DOMAIN.md).
 */
import { canonicalRedirect, hstsHeader } from "../../src/lib/site/edge";
import { NOT_FOUND_HEADER } from "../../src/lib/share-meta";

interface EdgeEvent {
  url: URL;
  req: { method: string; headers: Headers };
  res?: { headers?: Headers };
}

export default async function siteEdgeMiddleware(
  event: EdgeEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const env = process.env;
  const host = event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    const target = canonicalRedirect(env, event.url, host);
    if (target) {
      return new Response(null, { status: 301, headers: { location: target, "cache-control": "public, max-age=3600" } });
    }
  }
  const hsts = hstsHeader(env, event.url, event.req.headers.get("x-forwarded-proto"));
  if (hsts) event.res?.headers?.set("strict-transport-security", hsts);
  let result = await next();
  if (result instanceof Response && result.headers.has(NOT_FOUND_HEADER)) {
    // Unknown look / house / collection / style / creator: real 404 (#183 F5).
    const headers = new Headers(result.headers);
    headers.delete(NOT_FOUND_HEADER);
    result = new Response(result.body, { status: 404, statusText: "Not Found", headers });
  }
  if (hsts && result instanceof Response && !result.headers.has("strict-transport-security")) {
    try {
      result.headers.set("strict-transport-security", hsts);
    } catch {
      const headers = new Headers(result.headers);
      headers.set("strict-transport-security", hsts);
      return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
    }
  }
  return result;
}
