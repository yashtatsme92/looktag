import { createHmac, timingSafeEqual } from "node:crypto";

/** One-time app nonce cookie. Not a session cookie. */
export const NATIVE_NONCE_COOKIE = "__Host-looktag.native_nonce";

const NONCE_MAX_AGE = 600;

/** App-created nonce: unguessable, and safe to put in a cookie and a query string. */
export function isNativeNonce(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function nativeNonceIdentifier(nonce: string): string {
  return `native-nonce:${nonce}`;
}

export function signNativeNonce(nonce: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(nonce).digest("base64url");
  return `${nonce}.${mac}`;
}

export function nativeNonceCookieMatches(
  cookie: string | null,
  nonce: string,
  secret: string,
): boolean {
  if (!cookie || !isNativeNonce(nonce) || !secret) return false;
  const expected = signNativeNonce(nonce, secret);
  const actual = Buffer.from(cookie);
  const want = Buffer.from(expected);
  if (actual.length !== want.length) return false;
  return timingSafeEqual(actual, want);
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function nativeNonceSetCookie(signed: string): string {
  return `${NATIVE_NONCE_COOKIE}=${signed}; Max-Age=${NONCE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function nativeNonceClearCookie(): string {
  return `${NATIVE_NONCE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Echo the app nonce on a looktag:// callback so the app can check it. */
export function withNonceOnLooktag(location: string, nonce: string): string {
  const url = new URL(location);
  if (!url.searchParams.has("nonce")) url.searchParams.set("nonce", nonce);
  return url.toString();
}
