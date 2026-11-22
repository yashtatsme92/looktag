/** First-party PostHog EU proxy. Cookies and auth headers are never forwarded. */

const ASSETS_ORIGIN = "https://eu-assets.i.posthog.com";
const API_ORIGIN = "https://eu.i.posthog.com";

const REQUEST_HEADERS = ["content-type", "content-encoding"];

export function ingestUpstream(pathname: string, search = ""): string | null {
  if (pathname !== "/ingest" && !pathname.startsWith("/ingest/")) return null;
  if (pathname.split("/").includes("..")) return null;
  const rest = pathname.slice("/ingest".length);
  const asset = rest === "/static" || rest.startsWith("/static/");
  const origin = asset ? ASSETS_ORIGIN : API_ORIGIN;
  const path = asset ? `/static${rest.slice("/static".length)}` : rest || "/";
  let url: URL;
  try {
    url = new URL(path, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${url.origin}${url.pathname}${query}`;
}

export function forwardIngestHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

export function ingestResponseHeaders(upstream: Headers): Headers {
  const out = new Headers();
  const contentType = upstream.get("content-type");
  if (contentType) out.set("content-type", contentType);
  const cache = upstream.get("cache-control");
  if (cache) out.set("cache-control", cache);
  return out;
}

export async function proxyIngest(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  const target = ingestUpstream(url.pathname, url.search);
  if (!target) return null;
  const method = request.method.toUpperCase();
  const bodyless = method === "GET" || method === "HEAD";
  const upstream = await fetchImpl(target, {
    method,
    headers: forwardIngestHeaders(request.headers),
    body: bodyless ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: ingestResponseHeaders(upstream.headers),
  });
}
