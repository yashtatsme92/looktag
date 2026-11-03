import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPLASH,
  EARLY_CHROME_SCRIPT,
  parseSplashId,
  resolveBootSplash,
  SPLASH_OPTIONS,
  SPLASH_IDS,
} from "./splash.ts";

describe("parseSplashId", () => {
  it("keeps every studio plate", () => {
    for (const id of SPLASH_IDS) assert.equal(parseSplashId(id), id);
    assert.deepEqual(SPLASH_IDS, ["wordmark", "tag-draw", "pieces", "soft-power"]);
    assert.deepEqual(SPLASH_OPTIONS.map(({ id }) => id), [...SPLASH_IDS]);
  });

  it("falls back to Tag draw for unknown values", () => {
    assert.equal(parseSplashId("neon"), DEFAULT_SPLASH);
    assert.equal(parseSplashId(null), DEFAULT_SPLASH);
    assert.equal(parseSplashId(""), DEFAULT_SPLASH);
    assert.equal(DEFAULT_SPLASH, "tag-draw");
  });
});

describe("resolveBootSplash", () => {
  it("keeps the stored plate until settings hydrate", () => {
    assert.equal(
      resolveBootSplash({ hydrated: false, stored: "pieces", fromStore: "tag-draw" }),
      "pieces",
    );
    assert.equal(
      resolveBootSplash({ hydrated: false, stored: "wordmark", fromStore: "tag-draw" }),
      "wordmark",
    );
    assert.equal(
      resolveBootSplash({ hydrated: false, stored: "soft-power", fromStore: "tag-draw" }),
      "soft-power",
    );
  });

  it("does not flash Tag draw when the store still holds the default", () => {
    const seen: string[] = [];
    let hydrated = false;
    const stored = "pieces" as const;
    let fromStore: "tag-draw" | "pieces" = "tag-draw";
    seen.push(resolveBootSplash({ hydrated, stored, fromStore }));
    hydrated = true;
    fromStore = "pieces";
    seen.push(resolveBootSplash({ hydrated, stored, fromStore }));
    assert.deepEqual(seen, ["pieces", "pieces"]);
    assert.equal(seen.includes("tag-draw"), false);
  });

  it("follows the store after hydrate", () => {
    assert.equal(
      resolveBootSplash({ hydrated: true, stored: "pieces", fromStore: "soft-power" }),
      "soft-power",
    );
    assert.equal(
      resolveBootSplash({ hydrated: true, stored: "wordmark", fromStore: "tag-draw" }),
      "tag-draw",
    );
  });
});

describe("early chrome script", () => {
  it("does not override the server-rendered global splash choice", () => {
    assert.match(EARLY_CHROME_SCRIPT, /looktag-theme-v1/);
    assert.equal(EARLY_CHROME_SCRIPT.includes("looktag-splash-v1"), false);
    assert.equal(EARLY_CHROME_SCRIPT.includes('setAttribute("data-splash"'), false);
  });
});
