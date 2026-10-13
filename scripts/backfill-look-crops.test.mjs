import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backfillLookCrops, imageDimensions } from "./backfill-look-crops.mjs";

function png(width, height) {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("legacy crop backfill", () => {
  it("writes one centred 3:4 crop per image and leaves it stable on rerun", async () => {
    const rows = [
      {
        id: "landscape",
        image_src: `data:image/png;base64,${png(1600, 1200).toString("base64")}`,
        crop_json: null,
      },
      { id: "remote", image_src: "https://cdn.example/look.jpg", crop_json: null },
    ];
    let updates = 0;
    const sql = {
      async query(text, params = []) {
        if (text.startsWith("select")) return rows.filter((row) => row.crop_json === null);
        updates += 1;
        const row = rows.find((item) => item.id === params[1]);
        row.crop_json = params[0];
        return [];
      },
    };
    const resolveImage = async (source) =>
      source.startsWith("data:image/") ? Buffer.from(source.split(",")[1], "base64") : null;

    assert.equal(imageDimensions(png(1600, 1200)).width, 1600);
    assert.equal(await backfillLookCrops(sql, resolveImage), 1);
    assert.deepEqual(JSON.parse(rows[0].crop_json), {
      x: 0.21875,
      y: 0,
      w: 0.5625,
      h: 1,
    });
    assert.equal(rows[1].crop_json, null);
    assert.equal(await backfillLookCrops(sql, resolveImage), 0);
    assert.equal(updates, 1);
  });

  it("reads JPEG dimensions from the frame header", () => {
    const bytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40, 0x03,
    ]);
    assert.deepEqual(imageDimensions(bytes), { width: 1600, height: 1200 });
  });
});
