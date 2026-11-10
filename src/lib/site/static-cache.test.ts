import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HASHED_ASSET_CACHE, STATIC_ASSET_CACHE, staticCacheControl } from "./static-cache.ts";

describe("static cache control", () => {
  for (const path of [
    "/looks/sunday-coat.jpg",
    "/looks/feed/sunday-coat-480.webp",
    "/looks/houses/maison-calve_satin-column.jpg",
    "/looks/feed/houses/maison-calve_satin-column-1200.avif",
    "/fonts/figtree-latin-500-normal.woff2",
    "/fonts/playfair-display-latin-500-italic.woff2",
    "/splash/wordmark-750x1334.png",
    "/og.jpg",
  ]) {
    it(`caches ${path} with revalidation`, () => {
      const value = staticCacheControl(path);
      assert.equal(value, STATIC_ASSET_CACHE);
      assert.match(value ?? "", /public/);
      assert.match(value ?? "", /max-age=604800/);
      assert.equal(value?.includes("immutable"), false);
    });
  }

  it("keeps hashed build assets immutable", () => {
    assert.equal(staticCacheControl("/assets/index-a1b2c3d4.js"), HASHED_ASSET_CACHE);
    assert.equal(staticCacheControl("/looks/feed/coat.deadbeef12.webp"), HASHED_ASSET_CACHE);
  });

  it("does not cache HTML or fresh API responses", () => {
    assert.equal(staticCacheControl("/"), null);
    assert.equal(staticCacheControl("/looks/seed-sunday-coat"), null);
    assert.equal(staticCacheControl("/houses/halvard"), null);
    assert.equal(staticCacheControl("/api/version"), null);
    assert.equal(staticCacheControl("/api/v1/looks"), null);
    assert.equal(staticCacheControl("/api/auth/ok"), null);
    assert.equal(staticCacheControl("/robots.txt"), null);
  });
});
