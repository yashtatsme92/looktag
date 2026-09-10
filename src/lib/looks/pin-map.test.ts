import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampPin,
  coverLayout,
  framePercentToImage,
  imagePercentToFrame,
  inFrame,
} from "./pin-map.ts";

describe("coverLayout", () => {
  it("crops the sides when the photo is wider than the frame", () => {
    const layout = coverLayout({ frameW: 100, frameH: 200, imgW: 300, imgH: 400 });
    assert.equal(layout.renderH, 200);
    assert.ok(layout.renderW > 100);
    assert.equal(layout.offsetY, 0);
    assert.ok(layout.offsetX < 0);
  });

  it("crops top and bottom when the frame is wider than the photo", () => {
    const layout = coverLayout({ frameW: 390, frameH: 500, imgW: 900, imgH: 1600 });
    assert.equal(layout.renderW, 390);
    assert.ok(layout.renderH > 500);
    assert.equal(layout.offsetX, 0);
    assert.ok(layout.offsetY < 0);
  });
});

describe("image <-> frame mapping", () => {
  it("round-trips a pin through a tall phone crop", () => {
    const box = { frameW: 390, frameH: 720, imgW: 1200, imgH: 1600 };
    const image = { x: 48, y: 34 };
    const frame = imagePercentToFrame(image.x, image.y, box);
    const back = framePercentToImage(frame.x, frame.y, box);
    assert.ok(Math.abs(back.x - image.x) < 0.05);
    assert.ok(Math.abs(back.y - image.y) < 0.05);
  });

  it("keeps a centre pin on the garment when the frame is short", () => {
    const tall = { frameW: 390, frameH: 720, imgW: 900, imgH: 1200 };
    const short = { frameW: 358, frameH: 320, imgW: 900, imgH: 1200 };
    const image = { x: 50, y: 40 };
    const onTall = imagePercentToFrame(image.x, image.y, tall);
    const onShort = imagePercentToFrame(image.x, image.y, short);
    assert.notEqual(Math.round(onTall.y), Math.round(onShort.y));
    const backShort = framePercentToImage(onShort.x, onShort.y, short);
    assert.ok(Math.abs(backShort.y - image.y) < 0.05);
  });

  it("clamps pins to the photo", () => {
    assert.equal(clampPin(-4), 1);
    assert.equal(clampPin(140), 99);
    assert.equal(clampPin(42.36), 42.4);
  });

  it("treats off-crop pins as out of frame", () => {
    assert.equal(inFrame({ x: 50, y: 50 }), true);
    assert.equal(inFrame({ x: 50, y: -40 }), false);
  });
});
