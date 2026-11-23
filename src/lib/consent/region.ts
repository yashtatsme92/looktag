/** ISO country to the consent region. Missing or unknown stays opt-in (EU/UK). */

export type ConsentRegion = "eu" | "us" | "in" | "row";

/** EU, EEA, UK, and Switzerland. GB is the UK. Territories are not folded into US. */
const OPT_IN_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB",
  "CH",
]);

export function isConsentRegion(value: string | null | undefined): value is ConsentRegion {
  return value === "eu" || value === "us" || value === "in" || value === "row";
}

/**
 * Classify a country code. Empty, XX, T1, and anything that is not an ISO
 * alpha-2 code are opt-in. Only the literal code US is the United States.
 */
export function classifyCountry(code: string | null | undefined): ConsentRegion {
  const raw = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw) || raw === "XX" || raw === "T1") return "eu";
  if (raw === "US") return "us";
  if (raw === "IN") return "in";
  if (OPT_IN_COUNTRIES.has(raw)) return "eu";
  return "row";
}

type HeaderSource = { get(name: string): string | null };

/** CF-IPCountry, then x-country-code. Header lookup is case-insensitive. */
export function countryFromHeaders(headers: HeaderSource): string | null {
  const cf = headers.get("cf-ipcountry")?.trim() || headers.get("CF-IPCountry")?.trim();
  if (cf) return cf;
  const fallback = headers.get("x-country-code")?.trim();
  return fallback || null;
}

export function gpcFromHeaders(headers: HeaderSource): boolean {
  return headers.get("sec-gpc")?.trim() === "1";
}
