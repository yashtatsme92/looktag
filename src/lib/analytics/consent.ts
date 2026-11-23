/** Consent gate for PostHog. The server cookie lt_consent is the source of truth. */

export const CONSENT_STORAGE_KEY = "lt_consent";
export const CONSENT_GRANTED = "granted";

/** True only when a project key is set and local consent is exactly "granted". */
export function shouldLoadAnalytics(key: string, consent: string | null | undefined): boolean {
  return key.trim().length > 0 && consent === CONSENT_GRANTED;
}
