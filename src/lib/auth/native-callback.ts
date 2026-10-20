import { isRegisteredLooktagCallback } from "./native.ts";

/** Query keys the OAuth callback may carry back on looktag://. Everything else is dropped. */
const CALLBACK_PARAMS = new Set(["cookie", "error", "error_description"]);

/**
 * Nonce the native app creates, sends with `sign-in/social`, and later checks
 * on the `looktag://` callback. 32 bytes, hex, so it is not a client guess.
 */
export function createNativeSignInNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** High entropy, and safe to put in a query string. Rejects repeated characters. */
export function isStrongNativeNonce(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(value)) return false;
  return new Set(value).size >= 8;
}

/** Timing-safe equality. A length mismatch is not equal. */
export function nonceEquals(actual: string, expected: string): boolean {
  if (!isStrongNativeNonce(actual) || !isStrongNativeNonce(expected)) return false;
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * The proxy URL the app opens in the system browser.
 * The stock Expo client does not add `nonce`; the app must open this URL itself
 * (`disableRedirect: true` on `sign-in/social`, then `openAuthSessionAsync`).
 */
export function nativeAuthorizationProxyUrl(appOrigin: string, authorizationURL: string, nonce: string): string {
  const url = new URL("/api/auth/expo-authorization-proxy", appOrigin);
  url.searchParams.set("authorizationURL", authorizationURL);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

/** True only when this callback is a registered looktag link carrying the nonce this app created. */
export function acceptNativeCallback(callbackUrl: string, expectedNonce: string): boolean {
  if (!isRegisteredLooktagCallback(callbackUrl)) return false;
  let nonce = "";
  try {
    nonce = new URL(callbackUrl).searchParams.get("nonce") ?? "";
  } catch {
    return false;
  }
  return nonceEquals(nonce, expectedNonce);
}

/** `looktag://` proxy redirect: drop every passed query, then add only the nonce. */
export function looktagProxyLocation(authorizationURL: string, nonce: string): string {
  const url = new URL(authorizationURL);
  const next = new URL("looktag://");
  if (url.pathname === "/") next.pathname = "/";
  next.searchParams.set("nonce", nonce);
  return next.toString();
}

/** Callback redirect: keep the session hand-off and error params, drop anything else, add the nonce. */
export function withNonceOnLooktag(location: string, nonce: string): string {
  const url = new URL(location);
  const next = new URL("looktag://");
  if (url.pathname === "/") next.pathname = "/";
  for (const [key, value] of url.searchParams) {
    if (CALLBACK_PARAMS.has(key)) next.searchParams.append(key, value);
  }
  next.searchParams.set("nonce", nonce);
  return next.toString();
}
