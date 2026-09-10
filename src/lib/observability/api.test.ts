import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskOtlpHeaders, parseOtlpHeaders } from "./model.ts";

const here = dirname(fileURLToPath(import.meta.url));
const apiSource = readFileSync(join(here, "api.ts"), "utf8");
const guardSource = readFileSync(join(here, "../admin/guard.server.ts"), "utf8");
const verifySource = readFileSync(join(here, "../auth/verify.server.ts"), "utf8");

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
  it("gates formerly-public read and ingest handlers behind requireObservabilityAdmin", () => {
    for (const name of ["getObservability", "listObservabilitySignals", "ingestClientSignals"] as const) {
      const body = handlerBody(name);
      const gateAt = body.indexOf("await requireObservabilityAdmin()");
      assert.ok(gateAt >= 0, `${name} must await requireObservabilityAdmin`);
      const workAt = Math.min(
        ...["ensureTelemetrySink", "listTraceBundle", "ingestSignals"]
          .map((token) => body.indexOf(token))
          .filter((idx) => idx >= 0),
      );
      assert.ok(workAt >= 0, `${name} handler body missing telemetry work`);
      assert.ok(gateAt < workAt, `${name} must gate before sink/list/ingest work`);
    }
  });

  it("requireObservabilityAdmin enforces same-site then requireAdmin (401/403)", () => {
    const gate = apiSource.slice(
      apiSource.indexOf("async function requireObservabilityAdmin"),
      apiSource.indexOf("export const getObservability"),
    );
    assert.match(gate, /assertSameSiteRequest\(\)/);
    assert.match(gate, /await requireAdmin\(\)/);
    assert.match(verifySource, /readonly status = 401/);
    assert.match(guardSource, /readonly status = 403/);
    assert.match(guardSource, /throw new UnauthorizedError\(\)/);
    assert.match(guardSource, /throw new ForbiddenError\(\)/);
  });

  it("keeps write handlers behind the same admin gate", () => {
    for (const name of ["saveObservability", "saveObservabilityFilters", "probeObservability"] as const) {
      assert.match(handlerBody(name), /await requireObservabilityAdmin\(\)/);
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
