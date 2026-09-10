import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  AiSearchUnauthorizedError,
  requireAiSearchUserId,
} from "./limits.ts";

const here = dirname(fileURLToPath(import.meta.url));
const suggestSource = readFileSync(join(here, "suggest.ts"), "utf8");

describe("AI search authz contract", () => {
  it("imports and attaches authMiddleware to all three mutating handlers", () => {
    assert.match(suggestSource, /import \{ authMiddleware \} from "@\/lib\/auth\/middleware"/);

    for (const name of ["suggestPieces", "suggestShops", "searchPin"] as const) {
      const fnStart = suggestSource.indexOf(`export const ${name} = createServerFn`);
      assert.ok(fnStart >= 0, `${name} should be exported`);
      const nextExport = suggestSource.indexOf("\nexport const ", fnStart + 1);
      const block = suggestSource.slice(fnStart, nextExport === -1 ? undefined : nextExport);
      assert.match(
        block,
        /\.middleware\(\[authMiddleware\]\)/,
        `${name} must attach authMiddleware (assertSameSiteRequest + session)`,
      );
      assert.match(
        block,
        /requireAiSearchUserId\(context\.userId\)/,
        `${name} must resolve the authenticated user id`,
      );
      assert.match(
        block,
        /enforceAiSearchQuota\(/,
        `${name} must consume AI/search quota before calling providers`,
      );
    }
  });

  it("denies anonymous callers with 401 before any quota or provider work", () => {
    assert.throws(
      () => requireAiSearchUserId(undefined),
      (error: unknown) => {
        assert.ok(error instanceof AiSearchUnauthorizedError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Unauthorized");
        return true;
      },
    );
  });
});
