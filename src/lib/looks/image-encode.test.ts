import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { encodeLookVariants } from "./image-encode.server.ts";
import { LOOK_IMAGE_BOXES } from "./image-variants.ts";
import { isThreeByFour } from "./photo-frame.ts";

async function jpeg(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 40, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

function box(files: Awaited<ReturnType<typeof encodeLookVariants>>["files"], size: "thumb" | "card" | "detail") {
  return files.find((file) => file.size === size && file.format === "webp");
}

describe("encodeLookVariants", () => {
  it("cuts a centered 3:4 crop from a portrait photo before resizing", async () => {
    const source = await jpeg(800, 1200);
    const encoded = await encodeLookVariants(source, { avif: false });
    assert.equal(encoded.sourceWidth, 800);
    assert.equal(encoded.sourceHeight, 1200);
    assert.equal(isThreeByFour(encoded.width, encoded.height), true);
    const thumb = box(encoded.files, "thumb");
    const card = box(encoded.files, "card");
    const detail = box(encoded.files, "detail");
    assert.deepEqual(thumb && { w: thumb.w, h: thumb.h }, LOOK_IMAGE_BOXES.thumb);
    assert.deepEqual(card && { w: card.w, h: card.h }, LOOK_IMAGE_BOXES.card);
    assert.equal(detail && isThreeByFour(detail.w, detail.h), true);
    assert.ok(detail && detail.w <= encoded.width && detail.h <= encoded.height);
    assert.ok(detail && detail.w <= LOOK_IMAGE_BOXES.detail.w);
  });

  it("cuts a centered 3:4 crop from a landscape photo without upscaling", async () => {
    const source = await jpeg(1600, 900);
    const encoded = await encodeLookVariants(source, { avif: true });
    assert.equal(isThreeByFour(encoded.width, encoded.height), true);
    const detail = box(encoded.files, "detail");
    const card = box(encoded.files, "card");
    const thumb = box(encoded.files, "thumb");
    assert.equal(detail && detail.w === LOOK_IMAGE_BOXES.detail.w && detail.h === LOOK_IMAGE_BOXES.detail.h, false);
    assert.equal(detail && isThreeByFour(detail.w, detail.h), true);
    assert.ok(detail && detail.h <= 900);
    assert.deepEqual(card && { w: card.w, h: card.h }, { w: 600, h: 800 });
    assert.deepEqual(thumb && { w: thumb.w, h: thumb.h }, { w: 150, h: 200 });
    assert.ok(encoded.files.some((file) => file.format === "avif" && file.size === "detail"));
  });

  it("cuts a centered 3:4 crop from a square photo", async () => {
    const source = await jpeg(900, 900);
    const encoded = await encodeLookVariants(source);
    assert.equal(isThreeByFour(encoded.width, encoded.height), true);
    assert.ok(encoded.width < 900);
    const detail = box(encoded.files, "detail");
    assert.equal(detail && isThreeByFour(detail.w, detail.h), true);
    assert.ok(detail && detail.w <= 900 && detail.h <= 900);
  });

  it("extracts a custom crop before resize and does not change the input bytes", async () => {
    const source = await jpeg(1200, 1600);
    const before = Buffer.from(source);
    const crop = { x: 0.1, y: 0.2, w: 0.6, h: 0.6 };
    const encoded = await encodeLookVariants(source, { crop });
    assert.deepEqual(Buffer.from(source), before);
    assert.equal(isThreeByFour(encoded.width, encoded.height), true);
    assert.ok(encoded.width < 1200 * 0.6 + 2);
  });
});
