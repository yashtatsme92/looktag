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
    assert.deepEqual(visibleCrop({ x: 0.125, y: 0, w: 0.75, h: 1 }, 390, 600), {
      x: 0.175,
      y: 0,
      w: 0.65,
      h: 1,
    });
  });
});
