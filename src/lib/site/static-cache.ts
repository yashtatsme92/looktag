/**
 * Cache-Control for static files Nitro serves from public/.
 * HTML and /api/* are not matched, so existing no-store headers stay put.
 * Filenames here are not content-hashed, so the cache revalidates.
 * Content-hashed /assets/* stay immutable.
 */

export const STATIC_ASSET_CACHE = "public, max-age=604800, stale-while-revalidate=2592000";
export const HASHED_ASSET_CACHE = "public, max-age=31536000, immutable";

const STATIC_EXT = /\.(?:avif|webp|jpe?g|png|gif|svg|ico|woff2?)$/i;
const HASHED_FILE = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;

export function staticCacheControl(pathname: string): string | null {
  const path = (pathname.split("?")[0] ?? "").split("#")[0] ?? "";
  if (!path.startsWith("/") || path.includes("..")) return null;
  if (path.startsWith("/assets/")) return HASHED_ASSET_CACHE;
  const file = path.slice(path.lastIndexOf("/") + 1);
  if (HASHED_FILE.test(file) && STATIC_EXT.test(path)) return HASHED_ASSET_CACHE;
  if (!STATIC_EXT.test(path)) return null;
  if (path.startsWith("/looks/") || path.startsWith("/fonts/") || path.startsWith("/splash/") || path === "/og.jpg") {
    return STATIC_ASSET_CACHE;
  }
  return null;
}
