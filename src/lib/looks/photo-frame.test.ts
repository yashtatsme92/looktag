import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayedLook, isThreeByFour, photoFrameMode } from "./photo-frame.ts";
import { pinInCrop } from "./pin-map.ts";

describe("photoFrameMode", () => {
  it("keeps a look with no original on the legacy plate", () => {
    assert.equal(photoFrameMode(undefined), "legacy");
    assert.equal(photoFrameMode({ width: 800, height: 1200 }), "legacy");
  });

  it("frames a seed original that is still 2:3 through the crop", () => {
    assert.equal(photoFrameMode({ original: "/looks/sunday-coat.jpg", width: 2, height: 3 }), "crop");
  });

  it("treats baked 3:4 variants as 1:1", () => {
    assert.equal(isThreeByFour(1080, 1440), true);
    assert.equal(photoFrameMode({ original: "/storage/looks/a/original.jpg", width: 1080, height: 1440 }), "baked");
  });
});

describe("displayedLook", () => {
  const crop = { x: 0, y: 0.0556, w: 1, h: 0.8888 };
  type Sample = {
    id: string;
    title: string;
    images?: { original?: string; width?: number; height?: number };
    crop?: { x: number; y: number; w: number; h: number };
  };
  const seed: Sample = { id: "seed-sunday-coat", title: "Sunday Coat" };

  it("uses the loader original when the static seed has none", () => {
    const loader: Sample = {
      id: "seed-sunday-coat",
      title: "Sunday Coat",
      images: { original: "/looks/sunday-coat.jpg", width: 2, height: 3 },
      crop,
    };
    const shown = displayedLook(seed, loader, "seed-sunday-coat");
    assert.equal(shown?.images?.original, "/looks/sunday-coat.jpg");
    assert.deepEqual(shown?.crop, crop);
    assert.equal(shown?.title, "Sunday Coat");
  });

  it("keeps an unmigrated loader look on the legacy plate", () => {
    const loader: Sample = {
      id: "seed-sunday-coat",
      title: "Sunday Coat",
      images: { width: 800, height: 1200 },
      crop,
    };
    const shown = displayedLook(seed, loader, "seed-sunday-coat");
    assert.equal(shown?.images?.original, undefined);
    assert.equal(photoFrameMode(undefined), "legacy");
  });

  it("keeps a store look that already has an original", () => {
    const store: Sample = { id: "seed-sunday-coat", title: "Edited", images: { original: "/storage/a.jpg" }, crop };
    const loader: Sample = { id: "seed-sunday-coat", title: "Server", images: { original: "/storage/b.jpg" }, crop };
    assert.equal(displayedLook(store, loader, "seed-sunday-coat")?.title, "Edited");
  });

  it("ignores a loader row for a different look", () => {
    const loader: Sample = { id: "other", title: "Other", images: { original: "/looks/x.jpg" }, crop };
    assert.equal(displayedLook(seed, loader, "seed-sunday-coat")?.images, undefined);
  });
});

describe("pinInCrop pixels", () => {
  it("lands a pin on the cropped frame within a fraction of a percent", () => {
    const crop = { x: 0, y: 0.0555556, w: 1, h: 0.8888888 };
    const pin = pinInCrop({ x: 52, y: 40 }, crop);
    assert.equal(pin.inside, true);
    const frameH = 520;
    const expectedY = ((40 / 100 - crop.y) / crop.h) * frameH;
    const actualY = (pin.y / 100) * frameH;
    assert.ok(Math.abs(actualY - expectedY) < 2);
  });

  it("hides a pin that sits outside the crop", () => {
    const crop = { x: 0, y: 0.0555556, w: 1, h: 0.8888888 };
    const pin = pinInCrop({ x: 41, y: 95 }, crop);
    assert.equal(pin.inside, false);
  });
});
