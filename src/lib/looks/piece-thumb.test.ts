import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pieceThumbCrop } from "./piece-thumb.ts";

function pinInThumb(crop: { left: number; top: number; width: number; height: number }, x: number, y: number, thumb: number) {
  return {
    x: crop.left + crop.width * (x / 100),
    y: crop.top + crop.height * (y / 100),
    covers: crop.left <= 0.01 && crop.top <= 0.01 && crop.left + crop.width >= thumb - 0.01 && crop.top + crop.height >= thumb - 0.01,
  };
}

describe("pieceThumbCrop", () => {
  it("centres the pinned point when the zoom window fits", () => {
    const thumb = 100;
    const crop = pieceThumbCrop({ imageWidth: 1000, imageHeight: 1000, x: 40, y: 60, thumb, zoom: 2 });
    const pin = pinInThumb(crop, 40, 60, thumb);
    assert.equal(pin.covers, true);
    assert.ok(Math.abs(pin.x - thumb / 2) < 0.05, String(pin.x));
    assert.ok(Math.abs(pin.y - thumb / 2) < 0.05, String(pin.y));
  });

  it("keeps the Arizona sandals pin in frame instead of the photo centre", () => {
    const thumb = 56;
    const crop = pieceThumbCrop({ imageWidth: 1152, imageHeight: 1728, x: 41, y: 95, thumb, zoom: 2.4 });
    const sandals = pinInThumb(crop, 41, 95, thumb);
    const centre = (-crop.top + thumb / 2) / crop.height * 100;
    assert.equal(sandals.covers, true);
    assert.ok(sandals.y >= -0.5 && sandals.y <= thumb + 0.5);
    assert.ok(Math.abs(centre - 95) < Math.abs(centre - 50));
    const visibleTop = (-crop.top / crop.height) * 100;
    assert.ok(visibleTop > 60, `window starts at ${visibleTop}`);
  });

  it("clamps a corner pin so the thumb never shows empty space", () => {
    const thumb = 80;
    const crop = pieceThumbCrop({ imageWidth: 800, imageHeight: 1200, x: 0, y: 100, thumb });
    const pin = pinInThumb(crop, 0, 100, thumb);
    assert.equal(pin.covers, true);
    assert.ok(pin.x >= -0.5 && pin.x <= thumb + 0.5);
    assert.ok(pin.y >= -0.5 && pin.y <= thumb + 0.5);
  });

  it("covers the thumb instead of stretching with object-fit fill", () => {
    const source = readFileSync("src/components/looks/piece-thumb.tsx", "utf8");
    assert.match(source, /object-cover/);
    assert.doesNotMatch(source, /object-fit:\s*fill|object-fill/);
  });
});
