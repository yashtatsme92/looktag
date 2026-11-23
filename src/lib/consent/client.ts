/** Browser helpers. Cookies are set by POST /api/consent, then mirrored to localStorage. */

import { CONSENT_STORAGE_KEY } from "../analytics/consent.ts";
import { resetAnalyticsBoot } from "../analytics/boot.ts";
import { withdrawAnalytics } from "../analytics/runtime.ts";
import { readBrowserCookie, readCookieHeader, storedFromCookieHeader } from "./cookies.ts";
import {
  CONSENT_POLICY_VERSION,
  type ConsentBasis,
  type ConsentValue,
  type StoredConsent,
  parseStoredConsent,
} from "./policy.ts";
import { classifyCountry, isConsentRegion, type ConsentRegion } from "./region.ts";

export type ConsentBoot = {
  region: ConsentRegion;
  stored: StoredConsent;
  gpc: boolean;
};

export function readBootFromDocument(): ConsentBoot {
  const el = typeof document === "undefined" ? null : document.documentElement;
  const regionAttr = el?.dataset.ltRegion;
  const region = isConsentRegion(regionAttr) ? regionAttr : classifyCountry(readBrowserCookie("lt_region"));
  const header = typeof document === "undefined" ? "" : document.cookie;
  const stored = storedFromCookieHeader(header);
  const gpc =
    el?.dataset.ltGpc === "1" ||
    (typeof navigator !== "undefined" &&
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
  return { region, stored, gpc };
}

export function mirrorConsentCache(value: string | null): void {
  try {
    if (value) localStorage.setItem(CONSENT_STORAGE_KEY, value);
    else localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // private mode
  }
}

/** Cookie wins. localStorage is only a cache of the last server value. */
export function readLiveConsent(): string | null {
  const value = readBrowserCookie("lt_consent");
  if (value === "granted" || value === "denied") {
    mirrorConsentCache(value);
    return value;
  }
  return null;
}

export async function postConsentDecision(
  value: ConsentValue,
  basis: ConsentBasis,
): Promise<StoredConsent> {
  const response = await fetch("/api/consent", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value, basis }),
  });
  if (!response.ok) throw new Error("consent");
  const body = (await response.json()) as { value?: string; basis?: string; at?: string; version?: number };
  const stored = parseStoredConsent({
    consent: body.value,
    basis: body.basis,
    at: body.at,
    version: body.version ?? CONSENT_POLICY_VERSION,
  });
  mirrorConsentCache(stored.value);
  return stored;
}

export function clearPosthogStorage(): void {
  if (typeof document === "undefined") return;
  withdrawAnalytics();
  resetAnalyticsBoot();
  try {
    for (const part of document.cookie.split(";")) {
      const name = part.trim().split("=")[0];
      if (name?.startsWith("ph_")) {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      }
    }
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ph_")) localStorage.removeItem(key);
    }
  } catch {
    // private mode
  }
}

export function readRegionCookie(): ConsentRegion | null {
  const value = readCookieHeader(typeof document === "undefined" ? "" : document.cookie, "lt_region");
  return isConsentRegion(value) ? value : null;
}
