/**
 * Sized look photos. Keys are content-hashed and do not include the look id.
 * WebP is what the feed asks for; JPEG is the fallback. AVIF is optional.
 */

export const LOOK_IMAGE_EDGES = { thumb: 200, card: 800, detail: 1440 } as const;
export const LOOK_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const FEED_PLATE_SIZES = "100vw";
export const FEED_LEAD_SIZES = "(min-width: 1024px) 66vw, 100vw";
export const FEED_GRID_SIZES = "(min-width: 1440px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw";

export const LOOK_IMAGE_SIZES = ["thumb", "card", "detail"] as const;
export const LOOK_IMAGE_FORMATS = ["avif", "webp", "jpeg"] as const;

export type LookImageSize = (typeof LOOK_IMAGE_SIZES)[number];
export type LookImageFormat = (typeof LOOK_IMAGE_FORMATS)[number];

export type StoredLookImageFile = {
  size: LookImageSize;
  format: LookImageFormat;
  key: string;
  w: number;
  h: number;
};

/** What we persist. Public URLs are derived from `key` so the CDN base can change. */
export type StoredLookImages = {
  hash: string;
  prefix: string;
  width: number;
  height: number;
  files: StoredLookImageFile[];
  original?: { key: string; contentType: string; w: number; h: number };
};

export type LookImageSizeUrls = { thumb: string; card: string; detail: string };

/** Returned on the look and from `/api/v1/looks`. Top-level sizes are WebP. */
export type LookImages = {
  thumb: string;
  card: string;
  detail: string;
  jpeg: LookImageSizeUrls;
  avif?: LookImageSizeUrls;
  width: number;
  height: number;
  srcWidth: { thumb: number; card: number; detail: number };
  original?: string;
};

export function variantKey(prefix: string, size: LookImageSize, format: LookImageFormat): string {
  const ext = format === "jpeg" ? "jpg" : format;
  return `${prefix}/${size}.${ext}`;
}

export function publicStorageUrl(key: string, env?: NodeJS.ProcessEnv): string {
  const source = env ?? (typeof process === "undefined" ? {} : process.env);
  const base = (source.STORAGE_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const parts = key.split("/");
  if (parts.length === 0 || parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("Invalid storage key");
  }
  const safe = parts.join("/");
  if (base) return `${base}/${safe}`;
  const provider = (source.STORAGE_PROVIDER || "local").trim().toLowerCase();
  if (provider === "local" || !provider) return `/storage/${safe}`;
  const endpoint = (source.S3_ENDPOINT || "").replace(/\/$/, "");
  const bucket = source.S3_BUCKET?.trim() || "looktag-photos";
  if (endpoint) return `${endpoint}/${bucket}/${safe}`;
  const region = source.S3_REGION?.trim() || "auto";
  return `https://${bucket}.s3.${region}.amazonaws.com/${safe}`;
}

export function parseStoredLookImages(raw: string | null | undefined): StoredLookImages | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredLookImages>;
    if (!parsed || typeof parsed.hash !== "string" || typeof parsed.prefix !== "string" || !Array.isArray(parsed.files)) {
      return null;
    }
    if (
      parsed.prefix.includes("..") ||
      parsed.files.some((file) => !file?.key || String(file.key).includes("..")) ||
      (parsed.original && (!parsed.original.key || parsed.original.key.includes("..")))
    ) {
      return null;
    }
    return parsed as StoredLookImages;
  } catch {
    return null;
  }
}

export function toPublicImages(stored: StoredLookImages, env?: NodeJS.ProcessEnv): LookImages {
  const pick = (size: LookImageSize, format: LookImageFormat) =>
    stored.files.find((file) => file.size === size && file.format === format);
  const jpeg = {
    thumb: urlOf(pick("thumb", "jpeg"), env),
    card: urlOf(pick("card", "jpeg"), env),
    detail: urlOf(pick("detail", "jpeg"), env),
  };
  const webp = {
    thumb: urlOf(pick("thumb", "webp"), env),
    card: urlOf(pick("card", "webp"), env),
    detail: urlOf(pick("detail", "webp"), env),
  };
  const avifFiles = LOOK_IMAGE_SIZES.map((size) => pick(size, "avif"));
  const avif = avifFiles.every(Boolean)
    ? {
        thumb: urlOf(avifFiles[0], env),
        card: urlOf(avifFiles[1], env),
        detail: urlOf(avifFiles[2], env),
      }
    : undefined;
  return {
    thumb: webp.thumb,
    card: webp.card,
    detail: webp.detail,
    jpeg,
    avif,
    width: stored.width,
    height: stored.height,
    srcWidth: {
      thumb: pick("thumb", "webp")?.w || LOOK_IMAGE_EDGES.thumb,
      card: pick("card", "webp")?.w || LOOK_IMAGE_EDGES.card,
      detail: pick("detail", "webp")?.w || LOOK_IMAGE_EDGES.detail,
    },
    original: stored.original ? publicStorageUrl(stored.original.key, env) : undefined,
  };
}

function urlOf(file: StoredLookImageFile | undefined, env?: NodeJS.ProcessEnv): string {
  if (!file) return "";
  return publicStorageUrl(file.key, env);
}

export function formatSrcSet(images: LookImages, format: LookImageFormat): string {
  const urls = format === "webp" ? images : format === "jpeg" ? images.jpeg : images.avif;
  if (!urls) return "";
  return LOOK_IMAGE_SIZES.map((size) => {
    const url = urls[size];
    return url ? `${url} ${images.srcWidth[size]}w` : "";
  })
    .filter(Boolean)
    .join(", ");
}

/** Preferred single URL for clients that cannot send srcset. */
export function fallbackImageSrc(images: LookImages): string {
  return images.jpeg.detail || images.detail || images.jpeg.card || images.card;
}

/** Local measurement hook only. A production request must not migrate photos. */
export function requestPhotoMigrationEnabled(env: { MIGRATE_LOOK_PHOTOS?: string; NODE_ENV?: string }): boolean {
  return env.MIGRATE_LOOK_PHOTOS === "1" && env.NODE_ENV !== "production";
}
