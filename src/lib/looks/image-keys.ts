import { createHash } from "node:crypto";
import type { CropRect } from "./crop.ts";

/** sha256 hex of the original bytes and, when baked, the crop used for variants. */
export function contentHash(bytes: Uint8Array, crop?: CropRect): string {
  const hash = createHash("sha256").update(bytes);
  if (crop) hash.update(JSON.stringify(crop));
  return hash.digest("hex");
}

/**
 * Unguessable prefix: hash of the look id (so the id is not in the URL) plus
 * the content hash (so a new photo is a new key and caches can be immutable).
 * The same look and the same bytes always produce the same prefix.
 */
export function lookPhotoPrefix(lookId: string, hash: string): string {
  const idHash = createHash("sha256").update(`looktag-look:${lookId}`).digest("hex").slice(0, 16);
  return `looks/${idHash}/${hash.slice(0, 32)}`;
}
