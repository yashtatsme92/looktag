/**
 * First-party proxy for PostHog EU.
 * /ingest/static/* -> eu-assets.i.posthog.com/static/*
 * /ingest/* -> eu.i.posthog.com/*
 * Forwards body and content-type. Does not forward cookies or auth headers.
 */
import { proxyIngest } from "../../src/lib/analytics/ingest-proxy";

interface IngestEvent {
  url: URL;
  req: Request;
}

export default async function ingestMiddleware(
  event: IngestEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const path = event.url.pathname;
  if (path !== "/ingest" && !path.startsWith("/ingest/")) return next();
  const method = (event.req.method ?? "GET").toUpperCase();
  const headers = new Headers(event.req.headers);
  const bodyless = method === "GET" || method === "HEAD";
  const request = new Request(event.url, {
    method,
    headers,
    body: bodyless ? undefined : await event.req.arrayBuffer(),
  });
  return (await proxyIngest(request)) ?? next();
}
