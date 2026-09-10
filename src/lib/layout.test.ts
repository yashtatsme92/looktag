import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHousesPath, isLooksPath, isYouPath, navItemActive } from "../components/layout/app-nav.ts";
import { chromeFromWidth, isWideChrome } from "./pwa/layout.ts";
import { surfaceFromUserAgent } from "./share-meta.ts";

describe("app nav paths", () => {
  it("treats look permalinks as Looks, house permalinks as Houses", () => {
    assert.equal(isLooksPath("/"), true);
    assert.equal(isLooksPath("/looks/seed-sunday-coat"), true);
    assert.equal(isLooksPath("/houses"), false);
    assert.equal(isHousesPath("/houses/label-atelier-noir"), true);
    assert.equal(isYouPath("/login"), true);
    assert.equal(isYouPath("/admin/studio"), true);
    assert.equal(navItemActive("create", "/create"), true);
    assert.equal(navItemActive("looks", "/rank"), false);
  });
});

describe("desktop surface", () => {
  it("does not treat a laptop browser as native chrome", () => {
    assert.equal(
      surfaceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"),
      "web",
    );
  });

  it("treats iPad as a website, not a stretched phone", () => {
    assert.equal(
      surfaceFromUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
      "web",
    );
  });
});

describe("chrome from width", () => {
  it("keeps phone chrome below 768, even on a tall viewport", () => {
    assert.equal(chromeFromWidth(390), "phone");
    assert.equal(chromeFromWidth(767), "phone");
    assert.equal(isWideChrome("phone"), false);
  });

  it("switches to tablet then desktop, and never a stretched phone", () => {
    assert.equal(chromeFromWidth(768), "tablet");
    assert.equal(chromeFromWidth(1023), "tablet");
    assert.equal(chromeFromWidth(1024), "desktop");
    assert.equal(chromeFromWidth(1440), "desktop");
    assert.equal(isWideChrome("tablet"), true);
    assert.equal(isWideChrome("desktop"), true);
  });

  it("Capacitor native app stays on phone chrome at any width", () => {
    assert.equal(chromeFromWidth(1280, true), "phone");
    assert.equal(isWideChrome(chromeFromWidth(1024, true)), false);
  });
});
