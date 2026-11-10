import { localStorage } from "../providers/storage/local.ts";
import { resolveStorageProvider } from "../providers/storage/index.ts";
import { LOOK_IMAGE_CACHE_CONTROL } from "./image-variants.ts";

const IMAGE_TYPES: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/**
 * Serve `STORAGE_PROVIDER=local` objects at `/storage/...` with the cache
 * header stored at upload. R2/S3 responses come from the bucket, not here.
 */
export async function storageFileResponse(pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/storage/")) return null;
  if (resolveStorageProvider() !== "local") return new Response("Not found", { status: 404 });
  const key = pathname.slice("/storage/".length);
  let stored;
  try {
    stored = await localStorage().get(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stored) return new Response("Not found", { status: 404 });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = stored.contentType || IMAGE_TYPES[ext] || "application/octet-stream";
  const cacheControl = stored.cacheControl || (IMAGE_TYPES[ext] ? LOOK_IMAGE_CACHE_CONTROL : "public, max-age=3600");
  return new Response(Buffer.from(stored.body), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": cacheControl,
      "content-length": String(stored.body.byteLength),
    },
  });
}
