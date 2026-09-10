import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskOtlpHeaders, parseOtlpHeaders } from "./model.ts";

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
  it("gates formerly-public read and ingest handlers behind adminMiddleware", () => {
    for (const name of ["getObservability", "listObservabilitySignals", "ingestClientSignals"] as const) {
      const body = handlerBody(name);
      assert.match(body, /\.middleware\(\[adminMiddleware\]\)/, `${name} must use adminMiddleware`);
      assert.equal(body.includes("requireAdmin()"), false, `${name} must not call bare requireAdmin`);
      assert.equal(body.includes("requireObservabilityAdmin"), false);
      const workAt = Math.min(
        ...["ensureTelemetrySink", "listTraceBundle", "ingestSignals"]
          .map((token) => body.indexOf(token))
          .filter((idx) => idx >= 0),
      );
      assert.ok(workAt >= 0, `${name} handler body missing telemetry work`);
    }
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
