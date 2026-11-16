import { PublicError } from "../errors/public-error.ts";
import sharp from "sharp";
import { centeredCrop, type CropRect } from "./crop.ts";
import { LOOK_IMAGE_BOXES, LOOK_IMAGE_SIZES, type LookImageFormat, type LookImageSize } from "./image-variants.ts";

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

/** Pixel rect of the stored crop, snapped to an exact 3:4 box that fits inside it. */
export function cropExtract(width: number, height: number, crop: CropRect): { left: number; top: number; width: number; height: number } {
  const left = Math.min(width - 1, Math.max(0, Math.round(crop.x * width)));
  const top = Math.min(height - 1, Math.max(0, Math.round(crop.y * height)));
  const cropWidth = Math.min(width - left, Math.max(1, Math.round(crop.w * width)));
  const cropHeight = Math.min(height - top, Math.max(1, Math.round(crop.h * height)));
  const unit = Math.floor(Math.min(cropWidth / 3, cropHeight / 4));
  if (unit < 1) throw new PublicError("Use a JPEG, PNG, or WebP photo.");
  const bakedWidth = unit * 3;
  const bakedHeight = unit * 4;
  return {
    left: left + Math.floor((cropWidth - bakedWidth) / 2),
    top: top + Math.floor((cropHeight - bakedHeight) / 2),
    width: bakedWidth,
    height: bakedHeight,
  };
}

/**
 * Cut the stored crop out of the original, then resize to exact 3:4 variants.
 * Never upscales: a cropped source smaller than a target is encoded at the
 * largest 3:4 size that fits.
 */
export async function encodeLookVariants(
  bytes: Uint8Array,
  options?: { avif?: boolean; crop?: CropRect },
): Promise<{ width: number; height: number; sourceWidth: number; sourceHeight: number; files: EncodedLookFile[] }> {
  const base = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;
  if (sourceWidth < 1 || sourceHeight < 1) throw new PublicError("Use a JPEG, PNG, or WebP photo.");
  const crop = options?.crop ?? centeredCrop(sourceWidth, sourceHeight);
  const extract = cropExtract(sourceWidth, sourceHeight, crop);
  const wantAvif = avifEnabled(process.env, options?.avif);
  const files: EncodedLookFile[] = [];
  for (const size of LOOK_IMAGE_SIZES) {
    const box = LOOK_IMAGE_BOXES[size];
    const unit = Math.floor(Math.min(extract.width / 3, extract.height / 4, box.w / 3, box.h / 4));
    const targetWidth = unit * 3;
    const targetHeight = unit * 4;
    const resized = base.clone().extract(extract).resize({
      width: targetWidth,
      height: targetHeight,
      fit: "fill",
      withoutEnlargement: true,
    });
    const webp = await resized.clone().webp({ quality: 74, effort: 3 }).toBuffer({ resolveWithObject: true });
    files.push(file(size, "webp", webp, targetWidth, targetHeight));
    const jpeg = await resized.clone().jpeg({ quality: 76, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    files.push(file(size, "jpeg", jpeg, targetWidth, targetHeight));
    if (wantAvif) {
      const avif = await resized.clone().avif({ quality: 48, effort: 2 }).toBuffer({ resolveWithObject: true });
      files.push(file(size, "avif", avif, targetWidth, targetHeight));
    }
  }
  return { width: extract.width, height: extract.height, sourceWidth, sourceHeight, files };
}

function file(
  size: LookImageSize,
  format: LookImageFormat,
  encoded: { data: Buffer; info: { width?: number; height?: number } },
  fallbackW: number,
  fallbackH: number,
): EncodedLookFile {
  return {
    size,
    format,
    body: encoded.data,
    contentType: CONTENT_TYPE[format],
    w: encoded.info.width ?? fallbackW,
    h: encoded.info.height ?? fallbackH,
  };
}
