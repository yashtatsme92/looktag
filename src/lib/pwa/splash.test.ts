import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPLASH,
  EARLY_CHROME_SCRIPT,
  nextSplashId,
  parseSplashId,
  resolveSplashRotation,
  resolveBootSplash,
  SPLASH_OPTIONS,
  SPLASH_IDS,
  SPLASH_ROTATION_KEY,
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

describe("splash rotation", () => {
  it("starts from the admin selection and cycles round-robin", () => {
    assert.equal(resolveSplashRotation("pieces", null), "pieces");
    assert.equal(resolveSplashRotation("pieces", { selected: "pieces", last: "pieces" }), "soft-power");
    assert.equal(resolveSplashRotation("pieces", { selected: "pieces", last: "soft-power" }), "wordmark");
    assert.equal(resolveSplashRotation("pieces", { selected: "pieces", last: "wordmark" }), "tag-draw");
    assert.equal(resolveSplashRotation("pieces", { selected: "pieces", last: "tag-draw" }), "pieces");
    assert.equal(nextSplashId("soft-power"), "wordmark");
  });

  it("restarts at a changed admin selection and ignores invalid stored rotation", () => {
    assert.equal(resolveSplashRotation("wordmark", { selected: "pieces", last: "soft-power" }), "wordmark");
    assert.equal(resolveSplashRotation("pieces", { selected: "pieces", last: "neon" }), "pieces");
  });
});

describe("early chrome script", () => {
  it("rotates the server selection before first paint and skips share/replayed routes", () => {
    assert.match(EARLY_CHROME_SCRIPT, /looktag-theme-v1/);
    assert.match(EARLY_CHROME_SCRIPT, new RegExp(SPLASH_ROTATION_KEY));
    assert.match(EARLY_CHROME_SCRIPT, /sessionStorage\.getItem\("looktag-boot-v1"\)/);
    assert.match(EARLY_CHROME_SCRIPT, /var share=/);
    assert.match(EARLY_CHROME_SCRIPT, /setAttribute\("data-splash",shown\)/);
  });
});
