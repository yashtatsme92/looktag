import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskOtlpHeaders, parseOtlpHeaders } from "./model.ts";
import { parseClientSignals, ingestPayloadTooLarge, INGEST_MAX_BYTES } from "./client-signals.ts";
import { IngestRateLimiter, resolveClientIp } from "./ingest-limit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const apiSource = readFileSync(join(here, "api.ts"), "utf8");
const middlewareSource = readFileSync(join(here, "../auth/middleware.ts"), "utf8");
const guardSource = readFileSync(join(here, "../admin/guard.server.ts"), "utf8");
const verifySource = readFileSync(join(here, "../auth/verify.server.ts"), "utf8");
const isolationSource = readFileSync(join(here, "../auth/isolation.server.ts"), "utf8");

/** Extract the handler body for a named createServerFn export. */
function handlerBody(exportName: string): string {
  const start = apiSource.indexOf(`export const ${exportName}`);
  assert.ok(start >= 0, `missing export ${exportName}`);
  const nextExport = apiSource.indexOf("\nexport const ", start + 1);
  const end = nextExport === -1 ? apiSource.indexOf("\nfunction asSignal", start) : nextExport;
  assert.ok(end > start, `could not bound handler for ${exportName}`);
  return apiSource.slice(start, end);
}

describe("observability API admin auth", () => {
  it("gates admin reads behind adminMiddleware and leaves ingest anonymous", () => {
    for (const name of ["getObservability", "listObservabilitySignals"] as const) {
      const body = handlerBody(name);
      assert.match(body, /\.middleware\(\[adminMiddleware\]\)/, `${name} must use adminMiddleware`);
      assert.equal(body.includes("requireAdmin()"), false, `${name} must not call bare requireAdmin`);
      assert.equal(body.includes("requireObservabilityAdmin"), false);
      const workAt = Math.min(
        ...["ensureTelemetrySink", "listTraceBundle"]
          .map((token) => body.indexOf(token))
          .filter((idx) => idx >= 0),
      );
      assert.ok(workAt >= 0, `${name} handler body missing telemetry work`);
    }
    const ingest = handlerBody("ingestClientSignals");
    assert.equal(ingest.includes("adminMiddleware"), false, "browser ingest must accept anonymous signals");
    assert.match(ingest, /clientIngestLimiter\.allow/);
    assert.match(ingest, /ingestPayloadTooLarge/);
    assert.match(ingest, /parseClientSignals/);
    assert.match(ingest, /content-length/);
  });

  it("adminMiddleware enforces same-site then requireAdmin (401/403)", () => {
    const start = middlewareSource.indexOf("export const adminMiddleware");
    assert.ok(start >= 0);
    const body = middlewareSource.slice(start);
    assert.match(body, /requireAdminSameSite/);
    assert.match(guardSource, /export async function requireAdminSameSite/);
    assert.match(guardSource, /assertSameSiteRequest\(\)/);
    assert.match(isolationSource, /class CrossSiteRequestError/);
    assert.match(verifySource, /readonly status = 401/);
    assert.match(guardSource, /readonly status = 403/);
    assert.match(guardSource, /throw new UnauthorizedError\(\)/);
    assert.match(guardSource, /throw new ForbiddenError\(\)/);
  });

  it("keeps write handlers behind shared adminMiddleware", () => {
    for (const name of ["saveObservability", "saveObservabilityFilters", "probeObservability"] as const) {
      assert.match(handlerBody(name), /\.middleware\(\[adminMiddleware\]\)/);
      assert.equal(handlerBody(name).includes("requireObservabilityAdmin"), false);
    }
  });
});

describe("observability publicConfig header redaction", () => {
  it("never exposes otlp header plaintext via mask helpers used by publicConfig", () => {
    const raw = "Authorization=Bearer super-secret-token, X-Scope=looktag";
    const parsed = parseOtlpHeaders(raw);
    assert.equal(parsed.Authorization, "Bearer super-secret-token");
    const masked = maskOtlpHeaders(raw);
    assert.equal(masked.includes("super-secret-token"), false);
    assert.match(masked, /Authorization=••••/);
    assert.match(masked, /X-Scope=••••/);

    const storeSource = readFileSync(join(here, "store.server.ts"), "utf8");
    assert.match(storeSource, /otlpHeaders:\s*""/);
    assert.match(storeSource, /hasHeaders:/);
    assert.match(storeSource, /headersMasked:/);
    assert.equal(storeSource.includes("otlpHeaders: config.otlpHeaders"), false);
  });
});

const TRACE = "a".repeat(32);
const SPAN = "b".repeat(16);

describe("anonymous client ingest", () => {
  it("accepts a strict span and drops legacy or malformed rows", () => {
    const parsed = parseClientSignals([
      {
        kind: "span",
        id: SPAN,
        traceId: TRACE.toUpperCase(),
        spanId: SPAN,
        name: "HTTP GET",
        spanKind: "CLIENT",
        status: "OK",
        startTimeUnixNano: "1000",
        endTimeUnixNano: "2000",
        durationMs: 1,
        attributes: { "http.route": "/looks/$lookId", email: "secret@example.com" },
      },
      { kind: "span", name: "nope", traceId: "admin", spanId: "admin" },
      { kind: "other" },
    ]);
    assert.ok(parsed);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].kind === "span" && parsed[0].traceId, TRACE);
    assert.equal(JSON.stringify(parsed).includes("secret@example.com"), false);
    assert.equal(parseClientSignals({ signals: [] }), null);
  });

  it("rejects a payload over 64 KB", () => {
    assert.equal(INGEST_MAX_BYTES, 64 * 1024);
    assert.equal(ingestPayloadTooLarge({ signals: "x".repeat(INGEST_MAX_BYTES) }), true);
    assert.equal(ingestPayloadTooLarge({ signals: [] }), false);
  });

  it("allows 60 requests per IP per minute and then refuses", () => {
    let now = 1_000;
    const limiter = new IngestRateLimiter(60, 60_000, 100, () => now);
    for (let i = 0; i < 60; i += 1) assert.equal(limiter.allow("203.0.113.4"), true);
    assert.equal(limiter.allow("203.0.113.4"), false);
    assert.equal(limiter.allow("203.0.113.5"), true);
    now += 60_001;
    assert.equal(limiter.allow("203.0.113.4"), true);
  });

  it("uses the socket IP unless TRUST_PROXY trusts the first forwarded hop", () => {
    const forwarded = "203.0.113.9, 10.0.0.4";
    assert.equal(resolveClientIp({ trustProxy: false, forwardedFor: forwarded, socketIp: "10.0.0.4" }), "10.0.0.4");
    assert.equal(resolveClientIp({ trustProxy: false, forwardedFor: "198.51.100.2", socketIp: "10.0.0.4" }), "10.0.0.4");
    assert.equal(resolveClientIp({ trustProxy: true, forwardedFor: forwarded, socketIp: "10.0.0.4" }), "203.0.113.9");
    assert.equal(resolveClientIp({ trustProxy: true, forwardedFor: " 198.51.100.8 , 10.0.0.4", socketIp: "10.0.0.4" }), "198.51.100.8");
    assert.equal(resolveClientIp({ trustProxy: true, forwardedFor: "", socketIp: "10.0.0.4" }), "10.0.0.4");
    assert.equal(resolveClientIp({ trustProxy: false, socketIp: "" }), "unknown");
  });
});
