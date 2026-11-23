/** First-party consent cookies. Not written from document.cookie. */

import {
  CONSENT_AT_COOKIE,
  CONSENT_BASIS_COOKIE,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_POLICY_VERSION,
  CONSENT_VERSION_COOKIE,
  type ConsentBasis,
  type ConsentValue,
  type StoredConsent,
  parseStoredConsent,
} from "./policy.ts";

export function consentCookieLines(input: {
  value: ConsentValue;
  basis: ConsentBasis;
  at: string;
  secure: boolean;
}): string[] {
  const pairs: Array<[string, string]> = [
    [CONSENT_COOKIE, input.value],
    [CONSENT_BASIS_COOKIE, input.basis],
    [CONSENT_AT_COOKIE, input.at],
    [CONSENT_VERSION_COOKIE, String(CONSENT_POLICY_VERSION)],
  ];
  return pairs.map(([name, value]) => serializeConsentCookie(name, value, input.secure));
}

export function serializeConsentCookie(name: string, value: string, secure: boolean): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookieHeader(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

export function storedFromCookieHeader(header: string | null | undefined): StoredConsent {
  return parseStoredConsent({
    consent: readCookieHeader(header, CONSENT_COOKIE),
    basis: readCookieHeader(header, CONSENT_BASIS_COOKIE),
    at: readCookieHeader(header, CONSENT_AT_COOKIE),
    version: readCookieHeader(header, CONSENT_VERSION_COOKIE),
  });
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  return readCookieHeader(document.cookie, name);
}
