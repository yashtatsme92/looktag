import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { compressLookPhoto } from "./compress-photo.ts";

const PREFIX = "data:image/jpeg;base64,";
const LIMIT = 3 * 1024 * 1024;
const photo = new Blob(["photo"], { type: "image/jpeg" });

function mockBrowser(
  t: TestContext,
  options: {
    width?: number;
    height?: number;
    encode?: (quality: number, width: number, height: number) => string;
    noContext?: boolean;
    decodeError?: Error;
    drawError?: Error;
    noBitmap?: boolean;
  } = {},
) {
  const calls: {
    decode: unknown[][];
    draw: unknown[][];
    encode: [string, number, number, number][];
    closed: number;
  } = { decode: [], draw: [], encode: [], closed: 0 };
  const bitmap = {
    width: options.width ?? 4000,
    height: options.height ?? 3000,
    close: () => {
      calls.closed += 1;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () =>
      options.noContext
        ? null
        : {
            drawImage: (...args: unknown[]) => {
              calls.draw.push(args);
              if (options.drawError) throw options.drawError;
            },
          },
    toDataURL: (type: string, quality: number) => {
      calls.encode.push([type, quality, canvas.width, canvas.height]);
      return options.encode?.(quality, canvas.width, canvas.height) ?? `${PREFIX}AAAA`;
    },
  };
  const globals = {
    createImageBitmap: options.noBitmap
      ? undefined
      : async (...args: unknown[]) => {
          calls.decode.push(args);
          if (options.decodeError) throw options.decodeError;
          return bitmap;
        },
    document: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        return canvas;
      },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return { calls, bitmap };
}

function mockImageFallback(t: TestContext, fails = false) {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const sources: string[] = [];
  t.mock.method(URL, "createObjectURL", (blob: Blob) => {
    created.push(blob);
    return "blob:photo";
  });
  t.mock.method(URL, "revokeObjectURL", (url: string) => {
    revoked.push(url);
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class MockImage {
    naturalWidth = 3000;
    naturalHeight = 4000;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      sources.push(value);
      queueMicrotask(() => (fails ? this.onerror?.() : this.onload?.()));
    }
  }
  Object.defineProperty(globalThis, "Image", { value: MockImage, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else Reflect.deleteProperty(globalThis, "Image");
  });
  return { created, revoked, sources };
}

describe("compressLookPhoto", () => {
  it("decodes with embedded orientation and scales the oriented bitmap to 2048px", async (t) => {
    const { calls, bitmap } = mockBrowser(t, { width: 3000, height: 4000 });
    assert.equal(await compressLookPhoto(photo), `${PREFIX}AAAA`);
    assert.deepEqual(calls.decode, [[photo, { imageOrientation: "from-image" }]]);
    assert.deepEqual(calls.draw, [[bitmap, 0, 0, 1536, 2048]]);
    assert.deepEqual(calls.encode, [["image/jpeg", 0.85, 1536, 2048]]);
    assert.equal(calls.closed, 1);
  });

  it("does not upscale small images and keeps both dimensions nonzero", async (t) => {
    const { calls, bitmap } = mockBrowser(t, { width: 1, height: 100 });
    await compressLookPhoto(photo);
    assert.deepEqual(calls.draw, [[bitmap, 0, 0, 1, 100]]);
  });

  it("tries the quality sequence and requires the entire data URL to be strictly below 3 MiB", async (t) => {
    const exactLimit = PREFIX + "A".repeat(LIMIT - PREFIX.length);
    const underLimit = exactLimit.slice(0, -1);
    const { calls } = mockBrowser(t, {
      encode: (quality) => (quality === 0.6 ? underLimit : exactLimit),
    });
    assert.equal(await compressLookPhoto(photo), underLimit);
    assert.deepEqual(
      calls.encode.map((call) => call[1]),
      [0.85, 0.8, 0.7, 0.6],
    );
    assert.equal(calls.draw.length, 1);
    assert.equal(calls.closed, 1);
  });

  it("downscales and retries all qualities when the output stays too large", async (t) => {
    const tooLarge = PREFIX + "A".repeat(LIMIT - PREFIX.length);
    const { calls, bitmap } = mockBrowser(t, {
      encode: (_quality, width) => (width > 1024 ? tooLarge : `${PREFIX}AAAA`),
    });
    assert.equal(await compressLookPhoto(photo), `${PREFIX}AAAA`);
    assert.deepEqual(calls.draw, [
      [bitmap, 0, 0, 2048, 1536],
      [bitmap, 0, 0, 1024, 768],
    ]);
    assert.deepEqual(
      calls.encode.map((call) => call[1]),
      [0.85, 0.8, 0.7, 0.6, 0.85],
    );
    assert.equal(calls.closed, 1);
  });

  it("fails rather than returning an oversized data URL even at 1x1", async (t) => {
    const tooLarge = PREFIX + "A".repeat(LIMIT - PREFIX.length);
    const { calls } = mockBrowser(t, { width: 2, height: 1, encode: () => tooLarge });
    await assert.rejects(compressLookPhoto(photo), /below 3 MiB/);
    assert.deepEqual(
      calls.draw.map((args) => args.slice(3)),
      [
        [2, 1],
        [1, 1],
      ],
    );
    assert.equal(calls.encode.length, 8);
    assert.equal(calls.closed, 1);
  });

  it("falls back to an oriented HTML image when bitmap decoding fails", async (t) => {
    const { calls } = mockBrowser(t, { decodeError: new Error("unsupported image") });
    const fallback = mockImageFallback(t);
    assert.equal(await compressLookPhoto(photo), `${PREFIX}AAAA`);
    assert.deepEqual(calls.decode, [[photo, { imageOrientation: "from-image" }]]);
    assert.deepEqual(calls.draw[0].slice(1), [0, 0, 1536, 2048]);
    assert.deepEqual(fallback.created, [photo]);
    assert.deepEqual(fallback.sources, ["blob:photo"]);
    assert.deepEqual(fallback.revoked, ["blob:photo"]);
    assert.equal(calls.closed, 0);
  });

  it("uses the HTML image fallback when createImageBitmap is unavailable", async (t) => {
    const { calls } = mockBrowser(t, { noBitmap: true });
    const fallback = mockImageFallback(t);
    await compressLookPhoto(photo);
    assert.equal(calls.decode.length, 0);
    assert.deepEqual(calls.draw[0].slice(1), [0, 0, 1536, 2048]);
    assert.deepEqual(fallback.revoked, ["blob:photo"]);
  });

  it("reports fallback decode failure and revokes its object URL", async (t) => {
    const { calls } = mockBrowser(t, { decodeError: new Error("unsupported image") });
    const fallback = mockImageFallback(t, true);
    await assert.rejects(compressLookPhoto(photo), /Could not decode that photo/);
    assert.deepEqual(fallback.revoked, ["blob:photo"]);
    assert.equal(calls.closed, 0);
    assert.equal(calls.draw.length, 0);
  });

  it("closes the bitmap and reports processing failures", async (t) => {
    await t.test("invalid dimensions", async (subtest) => {
      const { calls } = mockBrowser(subtest, { width: 0 });
      await assert.rejects(compressLookPhoto(photo), /invalid image dimensions/);
      assert.equal(calls.closed, 1);
    });
    await t.test("missing context", async (subtest) => {
      const { calls } = mockBrowser(subtest, { noContext: true });
      await assert.rejects(compressLookPhoto(photo), /canvas is unavailable/);
      assert.equal(calls.closed, 1);
    });
    await t.test("drawing error", async (subtest) => {
      const error = new Error("draw failed");
      const { calls } = mockBrowser(subtest, { drawError: error });
      await assert.rejects(compressLookPhoto(photo), error);
      assert.equal(calls.closed, 1);
    });
    await t.test("unsupported JPEG encoding", async (subtest) => {
      const { calls } = mockBrowser(subtest, { encode: () => "data:image/png;base64,AAAA" });
      await assert.rejects(compressLookPhoto(photo), /encode.*JPEG/);
      assert.equal(calls.closed, 1);
    });
    await t.test("encoding throws", async (subtest) => {
      const error = new Error("encoding failed");
      const { calls } = mockBrowser(subtest, {
        encode: () => {
          throw error;
        },
      });
      await assert.rejects(compressLookPhoto(photo), error);
      assert.equal(calls.closed, 1);
    });
  });
});
