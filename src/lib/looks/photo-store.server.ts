import { PublicError } from "../errors/public-error.ts";
import sharp from "sharp";
import { storage } from "../providers/storage/index.ts";
import type { ObjectStorage } from "../providers/storage/types.ts";
import { encodeLookVariants } from "./image-encode.server.ts";
import { contentHash, lookPhotoPrefix } from "./image-keys.ts";
import { centeredCrop, type CropRect } from "./crop.ts";
import {
  LOOK_IMAGE_CACHE_CONTROL,
  fallbackImageSrc,
  parseStoredLookImages,
  toPublicImages,
  variantKey,
  type LookImages,
  type StoredLookImages,
} from "./image-variants.ts";

export function decodeDataImage(src: string): Uint8Array {
  const match = /^data:image\/(?:jpeg|jpg|png|webp)(?:;charset=[-\w.]+)?;base64,([a-z0-9+/=\s]+)$/i.exec(src);
  if (!match?.[1]) throw new PublicError("Use a JPEG, PNG, or WebP photo.");
  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (bytes.length < 16) throw new PublicError("Use a JPEG, PNG, or WebP photo.");
  return bytes;
}

export async function deleteStoredLookImages(stored: StoredLookImages | null, store: ObjectStorage = storage()): Promise<void> {
  if (!stored) return;
  if (stored.original?.key) await store.delete(stored.original.key);
  for (const file of stored.files) {
    await store.delete(file.key);
  }
}

async function orientedSize(bytes: Uint8Array): Promise<{ width: number; height: number; format: string }> {
  const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format ?? "jpeg" };
}

function cropsMatch(a: CropRect | undefined, b: CropRect): boolean {
  if (!a) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export async function storeLookPhoto(
  lookId: string,
  bytes: Uint8Array,
  store: ObjectStorage = storage(),
  options?: { avif?: boolean; crop?: CropRect },
): Promise<{ imageSrc: string; images: LookImages; stored: StoredLookImages; crop: CropRect }> {
  const source = await orientedSize(bytes);
  if (source.width < 1 || source.height < 1) throw new PublicError("Use a JPEG, PNG, or WebP photo.");
  const crop = options?.crop ?? centeredCrop(source.width, source.height);
  const hash = contentHash(bytes);
  const prefix = lookPhotoPrefix(lookId, contentHash(bytes, crop));
  const encoded = await encodeLookVariants(bytes, { avif: options?.avif, crop });
  const sourceFormat = source.format === "png" || source.format === "webp" ? source.format : "jpeg";
  const originalKey = `${prefix}/original.${sourceFormat === "jpeg" ? "jpg" : sourceFormat}`;
  const originalContentType = sourceFormat === "png" ? "image/png" : sourceFormat === "webp" ? "image/webp" : "image/jpeg";
  await store.put(originalKey, bytes, originalContentType, { cacheControl: LOOK_IMAGE_CACHE_CONTROL });
  const stored: StoredLookImages = {
    hash,
    prefix,
    width: encoded.width,
    height: encoded.height,
    files: [],
    crop,
    original: { key: originalKey, contentType: originalContentType, w: source.width, h: source.height },
  };
  for (const file of encoded.files) {
    const key = variantKey(prefix, file.size, file.format);
    await store.put(key, file.body, file.contentType, { cacheControl: LOOK_IMAGE_CACHE_CONTROL });
    stored.files.push({ size: file.size, format: file.format, key, w: file.w, h: file.h });
  }
  const images = toPublicImages(stored);
  return { imageSrc: fallbackImageSrc(images), images, stored, crop };
}

/**
 * Turn an uploaded data URL into stored sizes. Reuses the previous objects
 * when the bytes and crop have not changed, and deletes them when they have.
 * The original bytes are kept beside the 3:4 variants.
 */
export async function persistDataUrlPhoto(
  lookId: string,
  dataUrl: string,
  previousRaw: string | null,
  store: ObjectStorage = storage(),
  options?: { avif?: boolean; crop?: CropRect },
): Promise<{ imageSrc: string; images: LookImages; variantsJson: string; crop: CropRect }> {
  const bytes = decodeDataImage(dataUrl);
  const source = await orientedSize(bytes);
  const crop = options?.crop ?? centeredCrop(source.width, source.height);
  const hash = contentHash(bytes);
  const previous = parseStoredLookImages(previousRaw);
  if (previous?.hash === hash && previous.original && cropsMatch(previous.crop, crop)) {
    const images = toPublicImages(previous);
    return { imageSrc: fallbackImageSrc(images), images, variantsJson: JSON.stringify(previous), crop };
  }
  const saved = await storeLookPhoto(lookId, bytes, store, { avif: options?.avif, crop });
  if (previous && previous.prefix !== saved.stored.prefix) await deleteStoredLookImages(previous, store);
  return { imageSrc: saved.imageSrc, images: saved.images, variantsJson: JSON.stringify(saved.stored), crop };
}
