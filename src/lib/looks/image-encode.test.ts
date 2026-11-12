import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { encodeLookVariants } from "./image-encode.server.ts";
import { LOOK_IMAGE_EDGES } from "./image-variants.ts";

describe("encodeLookVariants", () => {
  it("writes thumb, card and detail WebP and JPEG without upscaling", async () => {
    const source = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: { r: 180, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const encoded = await encodeLookVariants(source, { avif: true });
    assert.equal(encoded.width, 800);
    assert.equal(encoded.height, 1000);
    const thumb = encoded.files.find((file) => file.size === "thumb" && file.format === "webp");
    const card = encoded.files.find((file) => file.size === "card" && file.format === "jpeg");
    const detail = encoded.files.find((file) => file.size === "detail" && file.format === "webp");
    const avif = encoded.files.find((file) => file.size === "detail" && file.format === "avif");
    assert.equal(thumb && Math.max(thumb.w, thumb.h), LOOK_IMAGE_EDGES.thumb);
    assert.equal(card && Math.max(card.w, card.h), LOOK_IMAGE_EDGES.card);
    assert.equal(detail?.w, 800);
    assert.equal(detail?.h, 1000);
    assert.ok(thumb && thumb.body[0] === 0x52 && thumb.body[1] === 0x49, "webp");
    assert.ok(card && card.body[0] === 0xff && card.body[1] === 0xd8, "jpeg");
    assert.ok(avif && avif.body.byteLength > 32, "avif");
    assert.ok(thumb && card && detail);
  });
});
