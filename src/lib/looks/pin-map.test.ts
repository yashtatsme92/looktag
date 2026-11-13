import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampPin,
  coverLayout,
  focusPosY,
  COVER_POS_Y,
  framePercentToImage,
  imagePercentToFrame,
  inFrame,
  nudgePinInside,
  pinInCrop,
} from "./pin-map.ts";
import { centeredCrop } from "./crop.ts";

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

describe("focusPosY", () => {
  const frame = 695 / 644; // desktop look card
  const img = 3 / 4;

  it("keeps every pin inside the cover window when their span fits", () => {
    const tags = [{ y: 28 }, { y: 40 }, { y: 72 }, { y: 90 }];
    const posY = focusPosY(tags, frame, img);
    for (const t of tags) {
      const box = { frameW: 695, frameH: 644, imgW: 900, imgH: 1200, posY };
      assert.equal(inFrame(imagePercentToFrame(50, t.y, box), 0), true, `pin at ${t.y}%`);
    }
  });

  it("falls back to the shared default when the frame shows the whole photo height", () => {
    assert.equal(focusPosY([{ y: 10 }], 0.5, 0.75), COVER_POS_Y);
    assert.equal(focusPosY([], frame, img), COVER_POS_Y);
  });

  it("stays within 0..1 for pins hugging an edge", () => {
    const top = focusPosY([{ y: 2 }, { y: 8 }], frame, img);
    const bottom = focusPosY([{ y: 92 }, { y: 98 }], frame, img);
    assert.ok(top >= 0 && top <= 1 && bottom >= 0 && bottom <= 1);
    assert.equal(top, 0);
    assert.equal(bottom, 1);
  });
});

describe("pinInCrop", () => {
  const crop = centeredCrop(1152, 1728);

  it("keeps a pin inside the stored 3:4 window", () => {
    const blouse = pinInCrop({ x: 52, y: 27 }, crop);
    assert.equal(blouse.inside, true);
    assert.ok(blouse.y > 0 && blouse.y < 100);
  });

  it("marks the Sun-Bleached sandals pin as outside that window", () => {
    const sandals = pinInCrop({ x: 41, y: 95 }, crop);
    assert.equal(sandals.inside, false);
    assert.ok(sandals.y > 100);
  });

  it("maps a pin near the crop edge and keeps it within the 3:4 image", () => {
    const edge = pinInCrop({ x: 99.5, y: 94 }, crop);
    assert.equal(edge.inside, true);
    assert.ok(edge.x <= 100 && edge.y <= 100);
    assert.ok(Math.abs((edge.x / 100) * 390 - 388.05) < 2);
    assert.ok(Math.abs((edge.y / 100) * 520 - 518.7) < 2);
  });

  it("treats a missing crop as the full photo", () => {
    assert.equal(pinInCrop({ x: 10, y: 10 }, null).inside, true);
    assert.equal(pinInCrop({ x: -2, y: 10 }, null).inside, false);
  });
});

describe("nudgePinInside", () => {
  it("leaves a centred pin alone", () => {
    assert.deepEqual(nudgePinInside(50, 40, 400, 600), { dx: 0, dy: 0, leader: false });
  });

  it("pulls an edge pin inside and asks for a leader", () => {
    const nudge = nudgePinInside(1, 98, 200, 400, 16);
    assert.ok(nudge.dx > 0);
    assert.ok(nudge.dy < 0);
    assert.equal(nudge.leader, true);
    assert.ok(Math.abs((1 / 100) * 200 + nudge.dx - 16) < 0.01);
  });

  it("does nothing without a frame", () => {
    assert.deepEqual(nudgePinInside(0, 0, 0, 0), { dx: 0, dy: 0, leader: false });
  });
});
