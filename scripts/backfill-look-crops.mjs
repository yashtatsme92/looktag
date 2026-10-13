// @ts-check
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * @typedef {{
 *   query: (text: string, params?: unknown[]) => Promise<Array<{ id: string, image_src: string }>>
 * }} CropSql
 */

/**
 * @param {CropSql} sql
 * @param {(imageSrc: string) => Promise<Buffer | null>} resolveImage
 */
export async function backfillLookCrops(sql, resolveImage = readLookImage) {
  const rows = await sql.query("select id, image_src from looks where crop_json is null");
  let updated = 0;
  for (const row of rows) {
    const bytes = await resolveImage(row.image_src);
    const dimensions = bytes && imageDimensions(bytes);
    if (!dimensions) continue;
    const crop = centeredCrop(dimensions.width, dimensions.height);
    await sql.query(
      "update looks set crop_json = $1 where id = $2 and crop_json is null",
      [JSON.stringify(crop), row.id],
    );
    updated += 1;
  }
  return updated;
}

/** @param {string} imageSrc */
export async function readLookImage(imageSrc) {
  if (typeof imageSrc !== "string") return null;
  if (imageSrc.startsWith("data:image/")) {
    const comma = imageSrc.indexOf(",");
    if (comma < 0 || !imageSrc.slice(0, comma).includes(";base64")) return null;
    return Buffer.from(imageSrc.slice(comma + 1), "base64");
  }
  if (!/^\/looks\/[a-zA-Z0-9._-]+$/.test(imageSrc)) return null;
  try {
    return await readFile(join(process.cwd(), "public", "looks", basename(imageSrc)));
  } catch {
    return null;
  }
}

/** @param {Buffer} bytes */
export function imageDimensions(bytes) {
  if (!bytes || bytes.length < 10) return null;
  if (bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.toString("ascii", 0, 3) === "GIF") {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X" && bytes.length >= 30) {
      return {
        width: readUInt24LE(bytes, 24) + 1,
        height: readUInt24LE(bytes, 27) + 1,
      };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21];
      const b2 = bytes[22];
      const b3 = bytes[23];
      const b4 = bytes[24];
      return {
        width: (((b2 & 0x3f) << 8) | b1) + 1,
        height: (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) + 1,
      };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (isStartOfFrame(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    if (length < 2) return null;
    offset += length;
  }
  return null;
}

/** @param {number} width @param {number} height */
function centeredCrop(width, height) {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  if (width / height > 3 / 4) {
    const w = (height * 3) / 4 / width;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = (width * 4) / 3 / height;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** @param {number} marker */
function isStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

/** @param {Buffer} bytes @param {number} offset */
function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
