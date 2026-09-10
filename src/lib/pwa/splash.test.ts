import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPLASH,
  EARLY_CHROME_SCRIPT,
  parseSplashId,
  resolveBootSplash,
  SPLASH_IDS,
  SPLASH_STORAGE_KEY,
} from "./splash.ts";

describe("parseSplashId", () => {
  it("keeps every studio plate", () => {
    for (const id of SPLASH_IDS) assert.equal(parseSplashId(id), id);
  });

  it("falls back to classy for unknown values", () => {
    assert.equal(parseSplashId("neon"), DEFAULT_SPLASH);
    assert.equal(parseSplashId(null), DEFAULT_SPLASH);
    assert.equal(parseSplashId(""), DEFAULT_SPLASH);
    assert.equal(DEFAULT_SPLASH, "classy");
  });
});

describe("resolveBootSplash", () => {
  it("keeps the stored plate until settings hydrate", () => {
    assert.equal(
      resolveBootSplash({ hydrated: false, stored: "atelier", fromStore: "classy" }),
      "atelier",
    );
    assert.equal(
      resolveBootSplash({ hydrated: false, stored: "minimal", fromStore: "classy" }),
      "minimal",
    );
    assert.equal(
      resolveBootSplash({ hydrated: false, stored: "numbered", fromStore: "classy" }),
      "numbered",
    );
  });

  it("does not flash Classy when the store still holds the default", () => {
    const seen: string[] = [];
    let hydrated = false;
    const stored = "atelier" as const;
    let fromStore: "classy" | "atelier" = "classy";
    seen.push(resolveBootSplash({ hydrated, stored, fromStore }));
    hydrated = true;
    fromStore = "atelier";
    seen.push(resolveBootSplash({ hydrated, stored, fromStore }));
    assert.deepEqual(seen, ["atelier", "atelier"]);
    assert.equal(seen.includes("classy"), false);
  });

  it("follows the store after hydrate", () => {
    assert.equal(
      resolveBootSplash({ hydrated: true, stored: "atelier", fromStore: "numbered" }),
      "numbered",
    );
    assert.equal(
      resolveBootSplash({ hydrated: true, stored: "minimal", fromStore: "quiet" }),
      "quiet",
    );
  });
});

describe("early chrome script", () => {
  it("restores a stored splash and never stamps Classy on an empty key", () => {
    assert.match(EARLY_CHROME_SCRIPT, new RegExp(SPLASH_STORAGE_KEY));
    assert.match(EARLY_CHROME_SCRIPT, /data-splash/);
    assert.equal(EARLY_CHROME_SCRIPT.includes('setAttribute("data-splash","classy")'), false);
    assert.equal(EARLY_CHROME_SCRIPT.includes('setAttribute("data-splash",\'classy\')'), false);
  });
});
