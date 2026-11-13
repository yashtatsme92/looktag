import sharp from "sharp";
import { centeredCrop, type CropRect } from "./crop.ts";
import { LOOK_IMAGE_EDGES, LOOK_IMAGE_SIZES, type LookImageFormat, type LookImageSize } from "./image-variants.ts";

export type EncodedLookFile = {
  size: LookImageSize;
  format: LookImageFormat;
  body: Uint8Array;
  contentType: string;
  w: number;
  h: number;
};

const CONTENT_TYPE: Record<LookImageFormat, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

export function avifEnabled(env: NodeJS.ProcessEnv = process.env, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return env.LOOK_IMAGE_AVIF === "1";
}

/** Resize the longest side to thumb / card / detail. Never upscales. */
export async function encodeLookVariants(
  bytes: Uint8Array,
  options?: { avif?: boolean; crop?: CropRect },
): Promise<{ width: number; height: number; files: EncodedLookFile[] }> {
  const base = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const swapsDimensions = meta.orientation !== undefined && [5, 6, 7, 8].includes(meta.orientation);
  const width = swapsDimensions ? (meta.height ?? 0) : (meta.width ?? 0);
  const height = swapsDimensions ? (meta.width ?? 0) : (meta.height ?? 0);
  if (width < 1 || height < 1) throw new Error("Use a JPEG, PNG, or WebP photo.");
  const crop = options?.crop ?? centeredCrop(width, height);
  const cropLeft = Math.min(width - 1, Math.max(0, Math.round(crop.x * width)));
  const cropTop = Math.min(height - 1, Math.max(0, Math.round(crop.y * height)));
  const cropWidth = Math.min(width - cropLeft, Math.max(1, Math.round(crop.w * width)));
  const cropHeight = Math.min(height - cropTop, Math.max(1, Math.round(crop.h * height)));
  const ratioUnit = Math.floor(Math.min(cropWidth / 3, cropHeight / 4));
  if (ratioUnit < 1) throw new Error("Photo is too small for a 3:4 crop.");
  const bakedWidth = ratioUnit * 3;
  const bakedHeight = ratioUnit * 4;
  const extract = {
    left: cropLeft + Math.floor((cropWidth - bakedWidth) / 2),
    top: cropTop + Math.floor((cropHeight - bakedHeight) / 2),
    width: bakedWidth,
    height: bakedHeight,
  };
  const wantAvif = avifEnabled(process.env, options?.avif);
  const files: EncodedLookFile[] = [];
  for (const size of LOOK_IMAGE_SIZES) {
    const height = Math.min(LOOK_IMAGE_EDGES[size], bakedHeight);
    const targetHeight = Math.max(4, Math.floor(height / 4) * 4);
    const targetWidth = (targetHeight / 4) * 3;
    const resized = base.clone().extract(extract).resize({
      width: targetWidth,
      height: targetHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
    const webp = await resized.clone().webp({ quality: 74, effort: 3 }).toBuffer({ resolveWithObject: true });
    files.push(file(size, "webp", webp));
    const jpeg = await resized.clone().jpeg({ quality: 76, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    files.push(file(size, "jpeg", jpeg));
    if (wantAvif) {
      const avif = await resized.clone().avif({ quality: 48, effort: 2 }).toBuffer({ resolveWithObject: true });
      files.push(file(size, "avif", avif));
    }
  }
  return { width: bakedWidth, height: bakedHeight, files };
}

function file(
  size: LookImageSize,
  format: LookImageFormat,
  encoded: { data: Buffer; info: { width?: number; height?: number } },
): EncodedLookFile {
  return {
    size,
    format,
    body: encoded.data,
    contentType: CONTENT_TYPE[format],
    w: encoded.info.width ?? ((LOOK_IMAGE_EDGES[size] / 4) * 3),
    h: encoded.info.height ?? LOOK_IMAGE_EDGES[size],
  };
}
