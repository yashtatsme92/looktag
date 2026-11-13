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
  if (!match?.[1]) throw new Error("Use a JPEG, PNG, or WebP photo.");
  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (bytes.length < 16) throw new Error("Use a JPEG, PNG, or WebP photo.");
  return bytes;
}

export async function deleteStoredLookImages(stored: StoredLookImages | null, store: ObjectStorage = storage()): Promise<void> {
  if (!stored) return;
  if (stored.original?.key) await store.delete(stored.original.key);
  for (const file of stored.files) {
    await store.delete(file.key);
  }
}

export async function storeLookPhoto(
  lookId: string,
  bytes: Uint8Array,
  store: ObjectStorage = storage(),
  options?: { avif?: boolean; crop?: CropRect },
): Promise<{ imageSrc: string; images: LookImages; stored: StoredLookImages }> {
  const metadata = await sharp(bytes, { failOn: "none" }).metadata();
  const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
  const width = swapsDimensions ? (metadata.height ?? 0) : (metadata.width ?? 0);
  const height = swapsDimensions ? (metadata.width ?? 0) : (metadata.height ?? 0);
  const crop = options?.crop ?? centeredCrop(width, height);
  const hash = contentHash(bytes, crop);
  const prefix = lookPhotoPrefix(lookId, hash);
  const encoded = await encodeLookVariants(bytes, { ...options, crop });
  const sourceFormat =
    metadata.format === "png" || metadata.format === "webp"
      ? metadata.format
      : metadata.format === "heif"
        ? "avif"
      : "jpeg";
  const originalContentType = `image/${sourceFormat}`;
  const originalKey = `${prefix}/original.${sourceFormat === "jpeg" ? "jpg" : sourceFormat}`;
  await store.put(originalKey, bytes, originalContentType, { cacheControl: LOOK_IMAGE_CACHE_CONTROL });
  const stored: StoredLookImages = {
    hash,
    prefix,
    width: encoded.width,
    height: encoded.height,
    files: [],
    original: { key: originalKey, contentType: originalContentType, w: metadata.width ?? encoded.width, h: metadata.height ?? encoded.height },
  };
  for (const file of encoded.files) {
    const key = variantKey(prefix, file.size, file.format);
    await store.put(key, file.body, file.contentType, { cacheControl: LOOK_IMAGE_CACHE_CONTROL });
    stored.files.push({ size: file.size, format: file.format, key, w: file.w, h: file.h });
  }
  const images = toPublicImages(stored);
  return { imageSrc: fallbackImageSrc(images), images, stored };
}

/**
 * Turn an uploaded data URL into stored sizes. Reuses the previous objects
 * when the bytes have not changed, and deletes them when they have.
 */
export async function persistDataUrlPhoto(
  lookId: string,
  dataUrl: string,
  previousRaw: string | null,
  store: ObjectStorage = storage(),
  options?: { avif?: boolean; crop?: CropRect },
): Promise<{ imageSrc: string; images: LookImages; variantsJson: string; crop: CropRect }> {
  const bytes = decodeDataImage(dataUrl);
  const metadata = await sharp(bytes, { failOn: "none" }).metadata();
  const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
  const width = swapsDimensions ? (metadata.height ?? 0) : (metadata.width ?? 0);
  const height = swapsDimensions ? (metadata.width ?? 0) : (metadata.height ?? 0);
  const crop = options?.crop ?? centeredCrop(width, height);
  const hash = contentHash(bytes, crop);
  const previous = parseStoredLookImages(previousRaw);
  if (previous?.hash === hash) {
    const images = toPublicImages(previous);
    return { imageSrc: fallbackImageSrc(images), images, variantsJson: JSON.stringify(previous), crop };
  }
  const saved = await storeLookPhoto(lookId, bytes, store, { ...options, crop });
  if (previous && previous.prefix !== saved.stored.prefix) await deleteStoredLookImages(previous, store);
  return { imageSrc: saved.imageSrc, images: saved.images, variantsJson: JSON.stringify(saved.stored), crop };
}
