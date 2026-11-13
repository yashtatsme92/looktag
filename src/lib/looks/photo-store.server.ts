import sharp from "sharp";
import { storage } from "../providers/storage/index.ts";
import type { ObjectStorage } from "../providers/storage/types.ts";
import { encodeLookVariants } from "./image-encode.server.ts";
import { createHash } from "node:crypto";
import { lookPhotoPrefix } from "./image-keys.ts";
import type { CropRect } from "./crop.ts";
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
  const hash = createHash("sha256").update(bytes).update(JSON.stringify(options?.crop ?? null)).digest("hex");
  const prefix = lookPhotoPrefix(lookId, hash);
  const encoded = await encodeLookVariants(bytes, options);
  const metadata = await sharp(bytes, { failOn: "none" }).metadata();
  const sourceFormat = metadata.format === "png" ? "png" : metadata.format === "webp" ? "webp" : "jpeg";
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
): Promise<{ imageSrc: string; images: LookImages; variantsJson: string }> {
  const bytes = decodeDataImage(dataUrl);
  const hash = createHash("sha256").update(bytes).update(JSON.stringify(options?.crop ?? null)).digest("hex");
  const previous = parseStoredLookImages(previousRaw);
  if (previous?.hash === hash) {
    const images = toPublicImages(previous);
    return { imageSrc: fallbackImageSrc(images), images, variantsJson: JSON.stringify(previous) };
  }
  const saved = await storeLookPhoto(lookId, bytes, store, options);
  if (previous && previous.prefix !== saved.stored.prefix) await deleteStoredLookImages(previous, store);
  return { imageSrc: saved.imageSrc, images: saved.images, variantsJson: JSON.stringify(saved.stored) };
}
