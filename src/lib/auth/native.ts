/**
 * Native-app (Expo / React Native) auth helpers — dependency-free so they can
 * be unit-tested with `node --experimental-strip-types` and imported anywhere.
 */

/** Custom URL scheme the native app registers for OAuth deep links. */
export const NATIVE_APP_SCHEME = "looktag";

/** Origins Better Auth must trust for the native app's deep-link callbacks. */
export const nativeTrustedOrigins: readonly string[] = [
  `${NATIVE_APP_SCHEME}://`,
  `${NATIVE_APP_SCHEME}://*`,
];

/** The bearer token from the `Authorization` bearer header, or null. */
export function bearerFromHeaders(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (!value || value.slice(0, 7).toLowerCase() !== "bearer ") return null;
  return value.slice(7).trim() || null;
}

/**
 * Headers that authenticate by `token` ONLY. Better Auth's `bearer()` plugin
 * falls back to the session cookie when the token is invalid, so every cookie
 * is dropped: a forged token can never ride a victim's cookie.
 */
export function bearerOnlyHeaders(headers: Headers, token: string): Headers {
  const next = new Headers(headers);
  next.delete("cookie");
  next.set("authorization", `Bearer ${token}`);
  return next;
}
