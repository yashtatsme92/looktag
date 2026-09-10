import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const guardSource = readFileSync(join(here, "guard.server.ts"), "utf8");
const middlewareSource = readFileSync(join(here, "../auth/middleware.ts"), "utf8");
const isolationSource = readFileSync(join(here, "../auth/isolation.server.ts"), "utf8");
const settingsApi = readFileSync(join(here, "../settings/api.ts"), "utf8");
const labelsApi = readFileSync(join(here, "../labels/api.ts"), "utf8");
const observabilityApi = readFileSync(join(here, "../observability/api.ts"), "utf8");

/** Extract the createServerFn export block for a named export. */
function handlerBody(source: string, exportName: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  assert.ok(start >= 0, `missing export ${exportName}`);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  const end = nextExport === -1 ? source.length : nextExport;
  return source.slice(start, end);
}

describe("admin same-site isolation (#4)", () => {
  it("requireAdminSameSite runs assertSameSiteRequest before requireAdmin", () => {
    const start = guardSource.indexOf("export async function requireAdminSameSite");
    assert.ok(start >= 0, "requireAdminSameSite must be exported");
    const body = guardSource.slice(start, start + 280);
    const sameSiteAt = body.indexOf("assertSameSiteRequest()");
    const adminAt = body.indexOf("requireAdmin(");
    assert.ok(sameSiteAt >= 0, "must call assertSameSiteRequest");
    assert.ok(adminAt >= 0, "must call requireAdmin");
    assert.ok(sameSiteAt < adminAt, "same-site check must precede requireAdmin");
  });

  it("adminMiddleware threads bearer and calls requireAdminSameSite", () => {
    const start = middlewareSource.indexOf("export const adminMiddleware");
    assert.ok(start >= 0, "adminMiddleware must be exported");
    const body = middlewareSource.slice(start);
    assert.match(body, /getBearerToken/);
    assert.match(body, /requireAdminSameSite/);
    assert.match(body, /bearerToken/);
  });

  it("CrossSiteRequestError and ForbiddenError are 403 contracts", () => {
    assert.match(isolationSource, /class CrossSiteRequestError/);
    assert.match(isolationSource, /readonly status = 403/);
    assert.match(guardSource, /class ForbiddenError/);
    assert.match(guardSource, /readonly status = 403/);
  });

  it("saveAppSettings uses adminMiddleware (regression: admin mutation isolation)", () => {
    const body = handlerBody(settingsApi, "saveAppSettings");
    assert.match(body, /\.middleware\(\[adminMiddleware\]\)/);
    assert.equal(body.includes("requireAdmin()"), false);
  });

  it("labels admin createServerFns use adminMiddleware", () => {
    for (const name of ["setLabelScouted", "listAdminHouses", "setHouseStatus"] as const) {
      const body = handlerBody(labelsApi, name);
      assert.match(body, /\.middleware\(\[adminMiddleware\]\)/, `${name} must use adminMiddleware`);
      assert.equal(body.includes("requireAdmin()"), false, `${name} must not call bare requireAdmin`);
    }
  });

  it("observability admin write createServerFns use adminMiddleware", () => {
    for (const name of ["saveObservability", "saveObservabilityFilters", "probeObservability"] as const) {
      const body = handlerBody(observabilityApi, name);
      assert.match(body, /\.middleware\(\[adminMiddleware\]\)/, `${name} must use adminMiddleware`);
      assert.equal(body.includes("requireAdmin()"), false, `${name} must not call bare requireAdmin`);
    }
  });
});
