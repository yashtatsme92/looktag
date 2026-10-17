import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centeredCrop, clampCrop, cropAtZoom, panCrop, visibleCrop, zoomMax } from "./crop.ts";

describe("crop geometry", () => {
  it("centres a locked 3:4 crop within landscape and portrait images", () => {
    assert.deepEqual(centeredCrop(1600, 1200), { x: 0.21875, y: 0, w: 0.5625, h: 1 });
    assert.deepEqual(centeredCrop(900, 1600), { x: 0, y: 0.125, w: 1, h: 0.75 });
  });

  it("limits zoom from the width of the 1x crop", () => {
    assert.ok(Math.abs(zoomMax(5185, 3457) - 2.4) < 0.001);
    assert.equal(zoomMax(800, 1200), 1);
  });

  it("clamps pans so the image always covers the crop", () => {
    assert.deepEqual(panCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 9, -9), {
      x: 0.5,
      y: 0,
      w: 0.5,
      h: 0.5,
    });
    assert.deepEqual(clampCrop({ x: -1, y: 2, w: 0.25, h: 0.5 }), {
      x: 0,
      y: 0.5,
      w: 0.25,
      h: 0.5,
    });
  });

  it("zooms around the crop centre and expands the view to the surface aspect", () => {
    assert.deepEqual(cropAtZoom(1600, 1200, 2), {
      x: 0.359375,
      y: 0.25,
      w: 0.28125,
      h: 0.5,
    });
    const phoneCrop = visibleCrop(
      { x: 0.21875, y: 0, w: 0.5625, h: 1 },
      1600,
      1200,
      390,
      600,
    );
    assert.ok(Math.abs(phoneCrop.x - 0.25625) < 1e-10);
    assert.equal(phoneCrop.y, 0);
    assert.ok(Math.abs(phoneCrop.w - 0.4875) < 1e-10);
    assert.equal(phoneCrop.h, 1);
    for (const [frameWidth, frameHeight] of [
      [786, 1000],
      [737, 756],
      [681, 656],
    ]) {
      const rect = visibleCrop(
        { x: 0.21875, y: 0, w: 0.5625, h: 1 },
        1600,
        1200,
        frameWidth,
        frameHeight,
      );
      assert.ok(rect.x >= 0 && rect.x + rect.w <= 1);
      assert.ok(Math.abs((rect.w * 1600) / (rect.h * 1200) - frameWidth / frameHeight) < 1e-10);
    }
  });

  it("keeps the native aspect when the frame is wider than the crop", () => {
    const rect = visibleCrop({ x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, 900, 1600, 1000, 400);
    assert.ok(rect.w <= 1 && rect.h <= 1);
    assert.ok(rect.x >= 0 && rect.x + rect.w <= 1);
    assert.ok(rect.y >= 0 && rect.y + rect.h <= 1);
    assert.ok(Math.abs((rect.w * 900) / (rect.h * 1600) - 1000 / 400) < 1e-10);
  });

  it("centres the window on an off-centre stored crop", () => {
    const rect = visibleCrop({ x: 0.2, y: 0.3, w: 0.4, h: 0.4 }, 1000, 1000, 500, 400);
    assert.ok(Math.abs(rect.y + rect.h / 2 - 0.5) < 1e-10);
    assert.ok(Math.abs(rect.x + rect.w / 2 - 0.4) < 1e-10);
    assert.ok(Math.abs(rect.w / rect.h - 1.25) < 1e-10);
  });
});
