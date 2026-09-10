/**
 * High-risk server-fn authz denial contracts (#6).
 *
 * Prioritized surfaces: saveLook ownership, setHouseStatus anonymous,
 * suggestPieces anonymous, getObservability anonymous.
 *
 * These are source + pure-helper contracts that run under `npm test` without a
 * browser or full TanStack request ALS. They assert against CURRENT main APIs
 * and stay valid after open gate PRs (#14 observability, #18 admin same-site,
 * #19 AI auth) by accepting the gate forms those PRs introduce.
 *
 * Assertion messages intentionally name the missing auth check so a red CI
 * run points at the regression.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ownsLook } from "../looks/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const lib = (...parts: string[]) => readFileSync(join(here, "..", ...parts), "utf8");

const looksApi = lib("looks", "api.ts");
const labelsApi = lib("labels", "api.ts");
const suggestSource = lib("ai", "suggest.ts");
const observabilityApi = lib("observability", "api.ts");
const middlewareSource = lib("auth", "middleware.ts");
const verifySource = lib("auth", "verify.server.ts");
const guardSource = lib("admin", "guard.server.ts");
const isolationSource = lib("auth", "isolation.server.ts");

/** Extract one `export const name = createServerFn…` block (until the next export). */
function exportBlock(source: string, exportName: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  assert.ok(start >= 0, `missing export ${exportName}`);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  const end = nextExport === -1 ? source.length : nextExport;
  return source.slice(start, end);
}

function hasAuthMiddleware(block: string): boolean {
  return /\.middleware\(\[authMiddleware\]\)/.test(block);
}

/** Admin gate forms on main today + after #14 / #18 land. */
function hasAdminGate(block: string): boolean {
  return (
    /\.middleware\(\[adminMiddleware\]\)/.test(block) ||
    /await requireAdmin\s*\(/.test(block) ||
    /await requireAdminSameSite\s*\(/.test(block) ||
    /await requireObservabilityAdmin\s*\(/.test(block)
  );
}

describe("denial primitives (401/403 contracts)", () => {
  it("UnauthorizedError is the 401 anonymous denial used by authMiddleware / requireAdmin", () => {
    assert.match(
      verifySource,
      /class UnauthorizedError extends Error/,
      "missing auth check primitive: UnauthorizedError",
    );
    assert.match(verifySource, /readonly status = 401/);
    assert.match(verifySource, /super\("Unauthorized"\)/);
    assert.match(
      verifySource,
      /if \(!user\) throw new UnauthorizedError\(\)/,
      "requireUserId must throw UnauthorizedError when signed out",
    );
  });

  it("ForbiddenError is the 403 non-admin denial used by requireAdmin", () => {
    assert.match(
      guardSource,
      /class ForbiddenError extends Error/,
      "missing auth check primitive: ForbiddenError",
    );
    assert.match(guardSource, /readonly status = 403/);
    assert.match(guardSource, /throw new UnauthorizedError\(\)/);
    assert.match(guardSource, /throw new ForbiddenError\(\)/);
  });

  it("authMiddleware runs same-site isolation then requireUserId", () => {
    assert.match(
      middlewareSource,
      /assertSameSiteRequest\(\)/,
      "authMiddleware missing auth check: assertSameSiteRequest",
    );
    assert.match(
      middlewareSource,
      /requireUserId\(/,
      "authMiddleware missing auth check: requireUserId",
    );
    assert.match(isolationSource, /class CrossSiteRequestError/);
    assert.match(isolationSource, /readonly status = 403/);
  });
});

describe("1) saveLook cross-user edit / ownership", () => {
  it("ownsLook denies cross-user and editorial looks (pure ownership helper)", () => {
    assert.equal(ownsLook({ userId: "alice" }, "alice"), true);
    assert.equal(
      ownsLook({ userId: "alice" }, "bob"),
      false,
      "saveLook missing auth check: cross-user ownership (ownsLook)",
    );
    assert.equal(ownsLook({ userId: "alice" }, null), false);
    assert.equal(ownsLook({ userId: "alice" }, undefined), false);
    assert.equal(ownsLook({ userId: "editorial" }, "editorial"), false);
  });

  it("saveLook attaches authMiddleware and rejects foreign owners", () => {
    const block = exportBlock(looksApi, "saveLook");
    assert.ok(
      hasAuthMiddleware(block),
      "saveLook missing auth check: authMiddleware (session + same-site)",
    );
    assert.match(
      block,
      /existing\[0\]\.user_id !== userId/,
      "saveLook missing auth check: compare existing owner to caller userId",
    );
    assert.match(
      block,
      /You can only edit your own looks\./,
      "saveLook missing auth check: cross-user ownership denial message",
    );
    // Denial must happen before insert/update writes.
    const denyAt = block.indexOf("You can only edit your own looks.");
    const updateAt = block.indexOf("update looks set");
    const insertAt = block.indexOf("insert into looks");
    assert.ok(denyAt >= 0 && updateAt >= 0 && insertAt >= 0);
    assert.ok(
      denyAt < updateAt && denyAt < insertAt,
      "saveLook ownership denial must run before look writes",
    );
  });
});

describe("2) setHouseStatus anonymous", () => {
  it("setHouseStatus gates behind requireAdmin / adminMiddleware before status writes", () => {
    const block = exportBlock(labelsApi, "setHouseStatus");
    assert.ok(
      hasAdminGate(block),
      "setHouseStatus missing auth check: requireAdmin (or adminMiddleware / requireAdminSameSite)",
    );
    const gateAt = Math.min(
      ...[
        block.search(/await requireAdmin\s*\(/),
        block.search(/await requireAdminSameSite\s*\(/),
        block.search(/\.middleware\(\[adminMiddleware\]\)/),
      ].filter((idx) => idx >= 0),
    );
    const workAt = block.search(/update fashion_labels set status/);
    assert.ok(gateAt >= 0, "setHouseStatus missing auth check: admin gate call site");
    assert.ok(workAt >= 0, "setHouseStatus handler missing status update work");
    assert.ok(
      gateAt < workAt,
      "setHouseStatus missing auth check: admin gate must run before status update",
    );
  });

  it("requireAdmin anonymous path is Unauthorized (401) before Forbidden (403)", () => {
    const start = guardSource.indexOf("export async function requireAdmin");
    assert.ok(start >= 0, "missing auth check: requireAdmin export");
    const body = guardSource.slice(start, start + 420);
    const unauthAt = body.indexOf("throw new UnauthorizedError()");
    const forbidAt = body.indexOf("throw new ForbiddenError()");
    assert.ok(unauthAt >= 0, "requireAdmin missing auth check: UnauthorizedError for anonymous");
    assert.ok(forbidAt >= 0, "requireAdmin missing auth check: ForbiddenError for non-admin");
    assert.ok(
      unauthAt < forbidAt,
      "requireAdmin must deny anonymous (401) before checking admin email (403)",
    );
  });
});

describe("3) suggestPieces anonymous", () => {
  const block = exportBlock(suggestSource, "suggestPieces");
  const gated = hasAuthMiddleware(block);

  it(
    "suggestPieces attaches authMiddleware so anonymous callers get 401",
    { skip: gated ? false : "TODO(#6/#2): suggestPieces not gated on main yet — wire authMiddleware (open PR #19); denial primitives covered below" },
    () => {
      assert.ok(
        hasAuthMiddleware(block),
        "suggestPieces missing auth check: authMiddleware (anonymous → Unauthorized 401)",
      );
      // After #19, quota/user resolution still goes through the authenticated context.
      assert.match(
        middlewareSource,
        /requireUserId/,
        "suggestPieces auth path missing auth check: requireUserId via authMiddleware",
      );
    },
  );

  it("intended anonymous denial path for AI search is authMiddleware → UnauthorizedError", () => {
    // Documents the contract even while suggestPieces is ungated on main.
    assert.match(
      middlewareSource,
      /export const authMiddleware/,
      "missing auth check for suggestPieces: authMiddleware export",
    );
    assert.match(
      verifySource,
      /class UnauthorizedError/,
      "missing auth check for suggestPieces: UnauthorizedError (401)",
    );
    assert.match(verifySource, /readonly status = 401/);
    assert.match(
      middlewareSource,
      /assertSameSiteRequest\(\)/,
      "missing auth check for suggestPieces: assertSameSiteRequest inside authMiddleware",
    );
    // Handler must remain a createServerFn POST so middleware can attach.
    assert.match(
      block,
      /createServerFn\(\{ method: "POST" \}\)/,
      "suggestPieces must stay a POST createServerFn so authMiddleware can gate it",
    );
  });
});

describe("4) getObservability anonymous", () => {
  const block = exportBlock(observabilityApi, "getObservability");
  const gated = hasAdminGate(block);

  it(
    "getObservability gates behind admin auth before reading config/telemetry",
    {
      skip: gated
        ? false
        : "TODO(#6/#3): getObservability not gated on main yet — require admin (open PR #14); denial primitives covered below",
    },
    () => {
      assert.ok(
        hasAdminGate(block),
        "getObservability missing auth check: requireAdmin / requireObservabilityAdmin / adminMiddleware",
      );
      const gateAt = Math.min(
        ...[
          block.search(/await requireAdmin\s*\(/),
          block.search(/await requireAdminSameSite\s*\(/),
          block.search(/await requireObservabilityAdmin\s*\(/),
          block.search(/\.middleware\(\[adminMiddleware\]\)/),
        ].filter((idx) => idx >= 0),
      );
      const workAt = Math.min(
        ...["ensureTelemetrySink", "readConfig", "listTraceBundle"]
          .map((token) => block.indexOf(token))
          .filter((idx) => idx >= 0),
      );
      assert.ok(gateAt >= 0, "getObservability missing auth check: admin gate call site");
      assert.ok(workAt >= 0, "getObservability handler missing telemetry read work");
      assert.ok(
        gateAt < workAt,
        "getObservability missing auth check: admin gate must run before telemetry reads",
      );
    },
  );

  it("intended anonymous denial path for observability reads is requireAdmin → 401/403", () => {
    assert.match(
      guardSource,
      /export async function requireAdmin/,
      "missing auth check for getObservability: requireAdmin export",
    );
    assert.match(
      verifySource,
      /class UnauthorizedError/,
      "missing auth check for getObservability: UnauthorizedError (401 anonymous)",
    );
    assert.match(
      guardSource,
      /class ForbiddenError/,
      "missing auth check for getObservability: ForbiddenError (403 non-admin)",
    );
    // Writes on main already use requireAdmin — same denial contract the read path should share.
    const saveBlock = exportBlock(observabilityApi, "saveObservability");
    assert.ok(
      hasAdminGate(saveBlock),
      "saveObservability missing auth check: requireAdmin (baseline for getObservability contract)",
    );
  });
});
