import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { localStorage } from "../providers/storage/local.ts";
import { encodeLookVariants } from "./image-encode.server.ts";
import { persistDataUrlPhoto, persistStoredPhotoCrop, storeLookPhoto } from "./photo-store.server.ts";
import { parseStoredLookImages } from "./image-variants.ts";
import { LOOK_IMAGE_EDGES, LOOK_IMAGE_SIZES, type LookImageSize } from "./image-variants.ts";

describe("encodeLookVariants", () => {
  it("bakes portrait, landscape and square photos into exact 3:4 variants without upscaling", async () => {
    const sources = [
      { width: 1600, height: 2400, detail: [1080, 1440] },
      { width: 2400, height: 1600, detail: [1080, 1440] },
      { width: 1800, height: 1800, detail: [1080, 1440] },
    ] as const;
    for (const source of sources) {
      const bytes = await sharp({
        create: { width: source.width, height: source.height, channels: 3, background: { r: 180, g: 40, b: 40 } },
      })
        .jpeg()
        .toBuffer();
      const encoded = await encodeLookVariants(bytes, { avif: true });
      assert.equal(encoded.width / encoded.height, 3 / 4);
      const dimensions: Record<LookImageSize, [number, number]> = {
        thumb: [150, 200],
        feed: [450, 600],
        card: [600, 800],
        detail: [...source.detail],
      };
      for (const size of LOOK_IMAGE_SIZES) {
        for (const format of ["webp", "jpeg", "avif"] as const) {
          const file = encoded.files.find((candidate) => candidate.size === size && candidate.format === format);
          assert.ok(file);
          assert.deepEqual([file.w, file.h], dimensions[size]);
          assert.equal(file.w / file.h, 3 / 4);
        }
      }
      assert.equal(Math.max(...sources[0].detail), LOOK_IMAGE_EDGES.detail);
    }
  });

  it("extracts a custom crop before resizing", async () => {
    const bytes = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: { r: 240, g: 0, b: 0 } },
    })
      .composite([{ input: { create: { width: 1200, height: 800, channels: 3, background: { r: 0, g: 240, b: 0 } } }, top: 400, left: 0 }])
      .jpeg()
      .toBuffer();
    const encoded = await encodeLookVariants(bytes, { avif: false, crop: { x: 0, y: 0.25, w: 1, h: 0.75 } });
    const detail = encoded.files.find((file) => file.size === "detail" && file.format === "jpeg");
    const { data } = await sharp(detail?.body).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[1] > data[0]);
    assert.deepEqual([detail?.w, detail?.h], [900, 1200]);
  });

  it("stores the untouched original separately from its cropped variants", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-original-"));
    try {
      const bytes = await sharp({
        create: { width: 1200, height: 1600, channels: 3, background: { r: 180, g: 40, b: 40 } },
      })
        .jpeg()
        .toBuffer();
      const store = localStorage(path.join(root, "storage"));
      const saved = await storeLookPhoto("test-look", bytes, store, {
        avif: false,
        crop: { x: 0, y: 0, w: 1, h: 1 },
      });
      assert.ok(saved.stored.original);
      assert.deepEqual((await store.get(saved.stored.original!.key))?.body, bytes);
      assert.equal(saved.stored.files.find((file) => file.size === "detail")?.h, 1440);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists the centered crop when an upload omits a custom crop", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-default-crop-"));
    try {
      const bytes = await sharp({
        create: { width: 1200, height: 1200, channels: 3, background: { r: 180, g: 40, b: 40 } },
      })
        .jpeg()
        .toBuffer();
      const store = localStorage(path.join(root, "storage"));
      const saved = await persistDataUrlPhoto(
        "square-look",
        `data:image/jpeg;base64,${bytes.toString("base64")}`,
        null,
        store,
        { avif: false },
      );
      assert.deepEqual(saved.crop, { x: 0.125, y: 0, w: 0.75, h: 1 });
      assert.ok(saved.images.original);
      assert.equal(saved.images.width / saved.images.height, 3 / 4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("re-crops from the preserved original and replaces the old variants", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-recrop-"));
    try {
      const bytes = await sharp({
        create: { width: 1200, height: 1800, channels: 3, background: { r: 180, g: 40, b: 40 } },
      })
        .jpeg()
        .toBuffer();
      const store = localStorage(path.join(root, "storage"));
      const firstCrop = { x: 0.125, y: 1 / 6, w: 0.75, h: 2 / 3 };
      const nextCrop = { x: 0.125, y: 0.1, w: 0.75, h: 2 / 3 };
      const first = await storeLookPhoto("test-look", bytes, store, { avif: false, crop: firstCrop });
      const next = await persistStoredPhotoCrop("test-look", JSON.stringify(first.stored), nextCrop, store);
      assert.ok(next);
      assert.deepEqual(next.crop, nextCrop);
      const manifest = parseStoredLookImages(next.variantsJson);
      assert.ok(manifest?.original);
      assert.deepEqual((await store.get(manifest.original.key))?.body, bytes);
      assert.equal(await store.get(first.stored.original!.key), null);
      assert.equal(manifest.files.find((file) => file.size === "detail")?.h, 1200);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
