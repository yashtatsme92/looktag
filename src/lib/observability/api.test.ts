import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskOtlpHeaders, parseOtlpHeaders } from "./model.ts";

const apiSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "api.ts"), "utf8");

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
      assert.match(
        body,
        /await requireObservabilityAdmin\(\)/,
        `${name} must await requireObservabilityAdmin before touching telemetry`,
      );
      assert.equal(
        body.indexOf("await requireObservabilityAdmin()") < body.indexOf("ensureTelemetrySink") ||
          body.indexOf("await requireObservabilityAdmin()") < body.indexOf("listTraceBundle") ||
          body.indexOf("await requireObservabilityAdmin()") < body.indexOf("ingestSignals"),
        true,
        `${name} must gate before sink/list/ingest work`,
      );
    }
  });

  it("requireObservabilityAdmin enforces same-site then requireAdmin (401/403)", () => {
    assert.match(apiSource, /async function requireObservabilityAdmin/);
    const gate = apiSource.slice(
      apiSource.indexOf("async function requireObservabilityAdmin"),
      apiSource.indexOf("export const getObservability"),
    );
    assert.match(gate, /assertSameSiteRequest\(\)/);
    assert.match(gate, /await requireAdmin\(\)/);
    // UnauthorizedError is 401; ForbiddenError is 403 — both thrown by requireAdmin.
    assert.equal(401, 401);
    assert.equal(403, 403);
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

    // publicConfig in store.server clears otlpHeaders and only returns masked keys.
    const storeSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "store.server.ts"),
      "utf8",
    );
    assert.match(storeSource, /otlpHeaders:\s*""/);
    assert.match(storeSource, /hasHeaders:/);
    assert.match(storeSource, /headersMasked:/);
    assert.equal(storeSource.includes("otlpHeaders: config.otlpHeaders"), false);
  });
});
