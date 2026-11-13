import { PublicError } from "../errors/public-error.ts";
import sharp from "sharp";
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
  options?: { avif?: boolean },
): Promise<{ width: number; height: number; files: EncodedLookFile[] }> {
  const base = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) throw new PublicError("Use a JPEG, PNG, or WebP photo.");
  const wantAvif = avifEnabled(process.env, options?.avif);
  const files: EncodedLookFile[] = [];
  for (const size of LOOK_IMAGE_SIZES) {
    const edge = LOOK_IMAGE_EDGES[size];
    const resized = base.clone().resize({
      width: edge,
      height: edge,
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
  return { width, height, files };
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
    w: encoded.info.width ?? LOOK_IMAGE_EDGES[size],
    h: encoded.info.height ?? LOOK_IMAGE_EDGES[size],
  };
}
