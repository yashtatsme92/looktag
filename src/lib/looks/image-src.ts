/**
 * Server-side bounds for look `imageSrc` values persisted in Postgres.
 *
 * Client uploads are compressed to JPEG data URLs in `./image.ts` (max edge 1400 /
 * AI path 960). There is no explicit client byte clamp; ~3.5 MiB covers compressed
 * look photos with headroom while rejecting multi-MB abuse on `saveLook`.
 *
 * ## Feed size budget (current bound + write enforcement)
 *
 * - Each saved data-URL `imageSrc` is at most {@link MAX_LOOK_IMAGE_DATA_URL_CHARS}.
 * - Short path / `https` references are capped at {@link MAX_LOOK_IMAGE_REF_CHARS}
 *   (seed `/looks/*.jpg` paths and future object-storage URLs).
 * - `listPublicLooks`, `getLookById`, and creator payloads still return full
 *   `imageSrc`. Worst-case feed payload ≈ `lookCount × MAX_LOOK_IMAGE_DATA_URL_CHARS`
 *   plus JSON metadata. Lean list DTOs (omit / truncate `imageSrc`, thumbnails)
 *   are a follow-up once the client can hydrate full images via `getLookById` —
 *   omitting `imageSrc` here would blank the Zustand feed.
 *
 * ## Migration / dual-write plan (object storage — not in this change)
 *
 * 1. Add nullable `image_url` (short https / R2 / S3 URL) alongside `image_src`.
 * 2. Dual-write on save: upload bytes to object storage, store the URL in
 *    `image_url`, keep writing `image_src` until all readers prefer URLs.
 * 3. Backfill existing inline data URLs asynchronously; stop accepting new
 *    inline data URLs once backfill coverage is acceptable.
 * 4. Drop or shrink `image_src` after readers only use `image_url`.
 */

/** ~3.5 MiB — aligned with the issue's AI/client clamp guidance. */
export const MAX_LOOK_IMAGE_DATA_URL_CHARS = Math.floor(3.5 * 1024 * 1024);

/** Max length for non-data reference URLs (paths / https object keys). */
export const MAX_LOOK_IMAGE_REF_CHARS = 2048;

const DATA_IMAGE_PREFIX_RE =
  /^data:image\/(jpeg|jpg|png|webp)(;charset=[-\w.]+)?(;base64)?,/i;

export type LookImageSrcParse =
  | { ok: true; value: string; kind: "data-url" | "ref" }
  | { ok: false; error: string };

/**
 * Validate a look photo for persistence. Rejects non-allowlisted MIME types,
 * oversized data URLs, and anything that is neither a data URL nor a short ref.
 */
export function parseLookImageSrc(imageSrc: unknown): LookImageSrcParse {
  if (typeof imageSrc !== "string" || imageSrc.length === 0) {
    return { ok: false, error: "Add a photo before saving." };
  }

  if (imageSrc.startsWith("data:")) {
    if (imageSrc.length > MAX_LOOK_IMAGE_DATA_URL_CHARS) {
      return {
        ok: false,
        error: "That photo is too large. Compress it and try again.",
      };
    }
    const headerMatch = DATA_IMAGE_PREFIX_RE.exec(imageSrc);
    if (!headerMatch) {
      return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
    }
    return { ok: true, value: imageSrc, kind: "data-url" };
  }

  if (imageSrc.length > MAX_LOOK_IMAGE_REF_CHARS) {
    return { ok: false, error: "That photo link is too long." };
  }

  // Same-origin static / future CDN paths (seed looks use `/looks/*.jpg`).
  if (
    imageSrc.startsWith("/") &&
    !imageSrc.startsWith("//") &&
    !imageSrc.includes("..") &&
    !/\s/.test(imageSrc)
  ) {
    return { ok: true, value: imageSrc, kind: "ref" };
  }

  // Future object-storage URLs (https only).
  if (/^https:\/\//i.test(imageSrc)) {
    try {
      const url = new URL(imageSrc);
      if (url.protocol !== "https:") {
        return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
      }
      return { ok: true, value: imageSrc, kind: "ref" };
    } catch {
      return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
    }
  }

  return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
}

/** Throw the same user-facing errors `saveLook` already uses. */
export function assertLookImageSrc(imageSrc: unknown): string {
  const parsed = parseLookImageSrc(imageSrc);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}
