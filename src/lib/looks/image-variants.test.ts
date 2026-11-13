import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentHash, lookPhotoPrefix } from "./image-keys.ts";
import {
  LOOK_IMAGE_CACHE_CONTROL,
  LOOK_IMAGE_EDGES,
  fallbackImageSrc,
  formatSrcSet,
  parseStoredLookImages,
  publicStorageUrl,
  requestPhotoMigrationEnabled,
  toPublicImages,
  variantKey,
  type StoredLookImages,
} from "./image-variants.ts";

describe("look photo keys", () => {
  it("hashes content and hides the look id", () => {
    const bytes = new TextEncoder().encode("photo-bytes");
    const hash = contentHash(bytes);
    assert.equal(hash.length, 64);
    assert.equal(contentHash(bytes), hash);
    const prefix = lookPhotoPrefix("seed-sunday-coat", hash);
    assert.equal(prefix.includes("seed-sunday-coat"), false);
    assert.equal(prefix.startsWith("looks/"), true);
    assert.equal(prefix.endsWith(hash.slice(0, 32)), true);
    assert.equal(lookPhotoPrefix("seed-sunday-coat", hash), prefix);
    assert.notEqual(lookPhotoPrefix("other-look", hash), prefix);
    assert.equal(variantKey(prefix, "card", "jpeg"), `${prefix}/card.jpg`);
    assert.equal(variantKey(prefix, "thumb", "webp"), `${prefix}/thumb.webp`);
    assert.equal(LOOK_IMAGE_EDGES.thumb, 200);
    assert.equal(LOOK_IMAGE_EDGES.card, 800);
    assert.equal(LOOK_IMAGE_EDGES.detail, 1440);
    assert.match(LOOK_IMAGE_CACHE_CONTROL, /immutable/);
  });

  it("builds public URLs and srcset from stored keys", () => {
    const stored: StoredLookImages = {
      hash: "abc",
      prefix: "looks/aa/abc",
      width: 800,
      height: 1000,
      files: [
        { size: "thumb", format: "webp", key: "looks/aa/abc/thumb.webp", w: 160, h: 200 },
        { size: "card", format: "webp", key: "looks/aa/abc/card.webp", w: 480, h: 600 },
        { size: "detail", format: "webp", key: "looks/aa/abc/detail.webp", w: 800, h: 1000 },
        { size: "thumb", format: "jpeg", key: "looks/aa/abc/thumb.jpg", w: 160, h: 200 },
        { size: "card", format: "jpeg", key: "looks/aa/abc/card.jpg", w: 480, h: 600 },
        { size: "detail", format: "jpeg", key: "looks/aa/abc/detail.jpg", w: 800, h: 1000 },
      ],
    };
    assert.deepEqual(parseStoredLookImages(JSON.stringify(stored))?.prefix, stored.prefix);
    assert.equal(parseStoredLookImages('{"prefix":"../x"}'), null);
    const images = toPublicImages(stored, { STORAGE_PUBLIC_BASE_URL: "https://img.thelooktag.com" });
    assert.equal(images.card, "https://img.thelooktag.com/looks/aa/abc/card.webp");
    assert.equal(images.jpeg.detail, "https://img.thelooktag.com/looks/aa/abc/detail.jpg");
    assert.equal(images.avif, undefined);
    assert.equal(fallbackImageSrc(images), images.jpeg.detail);
    assert.match(formatSrcSet(images, "webp"), /card\.webp 480w/);
    assert.equal(publicStorageUrl("looks/aa/abc/card.webp", {}), "/storage/looks/aa/abc/card.webp");
    assert.throws(() => publicStorageUrl("../secret", {}), /Invalid storage key/);
    assert.equal(requestPhotoMigrationEnabled({ MIGRATE_LOOK_PHOTOS: "1", NODE_ENV: "development" }), true);
    assert.equal(requestPhotoMigrationEnabled({ MIGRATE_LOOK_PHOTOS: "1", NODE_ENV: "production" }), false);
    assert.equal(requestPhotoMigrationEnabled({ NODE_ENV: "development" }), false);
  });
});
