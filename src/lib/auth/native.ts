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

/**
 * Exact deep-link callbacks the native app registers.
 * `looktag://` and `looktag:///` only — not `looktag://callback` or any other path.
 * A query string is allowed so the session hand-off and app nonce can ride back.
 */
export function isRegisteredLooktagCallback(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== `${NATIVE_APP_SCHEME}:`) return false;
  if (url.hostname !== "" || url.username !== "" || url.password !== "") return false;
  return url.pathname === "" || url.pathname === "/";
}

/** HTTPS callbacks registered with Google and Apple, plus the looktag deep links. */
export const NATIVE_PROVIDER_CALLBACK_PATHS = [
  "/api/auth/callback/google",
  "/api/auth/callback/apple",
] as const;

export function isRegisteredRedirectUri(redirectUri: string, appOrigin: string): boolean {
  if (isRegisteredLooktagCallback(redirectUri)) return true;
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return false;
  }
  if (redirect.username !== "" || redirect.password !== "") return false;
  if (redirect.origin !== appOrigin) return false;
  if (redirect.search !== "" || redirect.hash !== "") return false;
  return (NATIVE_PROVIDER_CALLBACK_PATHS as readonly string[]).includes(redirect.pathname);
}

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
