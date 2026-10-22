import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readLookImage } from "./image.ts";

describe("readLookImage", () => {
  it("keeps the uploaded image bytes and format unchanged", async () => {
    const file = new File([Uint8Array.of(0, 1, 2, 255)], "photo.png", { type: "image/png" });
    assert.equal(await readLookImage(file), "data:image/png;base64,AAEC/w==");
  });

  it("reports monotonic progress from 0 to 100", async () => {
    const file = new File([Uint8Array.of(0, 1, 2, 255)], "photo.png", { type: "image/png" });
    const seen: number[] = [];
    await readLookImage(file, (value) => seen.push(value));
    assert.equal(seen[0], 0);
    assert.equal(seen[seen.length - 1], 100);
    for (let index = 1; index < seen.length; index += 1) {
      assert.ok(seen[index] >= seen[index - 1], `${seen[index]} after ${seen[index - 1]}`);
    }
  });

  it("rejects non-image and oversized files", async () => {
    const text = new File(["no photo"], "photo.txt", { type: "text/plain" });
    await assert.rejects(readLookImage(text), /Choose a photo/);

    const oversized = new File([new Uint8Array(12 * 1024 * 1024 + 1)], "photo.png", { type: "image/png" });
    await assert.rejects(readLookImage(oversized), /under 12 MB/);
  });
});
