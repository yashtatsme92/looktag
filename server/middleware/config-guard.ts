/**
 * Production misconfiguration must stay reachable. Every route except a
 * degraded /healthz answers with the names-only configuration page.
 * This file is named so Nitro loads it before the platform chrome middleware.
 */
import { productionConfigProblems } from "../../src/lib/providers/assert-env.ts";
import { configErrorBody, healthDegradedBody } from "../../src/lib/providers/config-error.ts";

interface GuardEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const HEALTH = new Set(["/healthz", "/readyz"]);

const logged = globalThis as typeof globalThis & { __looktagConfigLogged?: boolean };

export default function configGuard(event: GuardEvent, next: () => unknown) {
  const problems = productionConfigProblems(process.env);
  if (problems.length === 0) return next();
  if (!logged.__looktagConfigLogged) {
    logged.__looktagConfigLogged = true;
    console.error(`[config] ${problems.map((item) => `${item.name} ${item.problem}`).join(", ")}`);
  }
  const path = event.url.pathname;
  const method = (event.req.method ?? "GET").toUpperCase();
  if (HEALTH.has(path) && (method === "GET" || method === "HEAD")) {
    const body = method === "HEAD" ? null : healthDegradedBody(problems);
    return new Response(body, {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (method !== "GET" && method !== "HEAD") {
    return new Response(configErrorBody(problems, "application/json").body, {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const accept = event.req.headers.get("accept");
  const rendered = configErrorBody(problems, accept);
  return new Response(method === "HEAD" ? null : rendered.body, {
    status: 503,
    headers: { "content-type": rendered.contentType, "cache-control": "no-store" },
  });
}
