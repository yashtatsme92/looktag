/**
 * Extra Better Auth trusted origins from `TRUSTED_ORIGINS` (comma-separated),
 * e.g. `TRUSTED_ORIGINS=https://looktag.onrender.com` to keep an old host
 * signing in while APP_URL / BETTER_AUTH_URL point at the new domain.
 *
 * Entries are trimmed, normalised to `scheme://host[:port]` and deduped.
 * An invalid entry fails boot with an error that names the variable and the
 * entry position only — never the value.
 */

export class TrustedOriginsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustedOriginsError";
  }
}

export function normalizeOrigin(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) return null;
  return url.origin;
}

/** Parse TRUSTED_ORIGINS. Throws TrustedOriginsError (names only) on any invalid entry. */
export function parseTrustedOrigins(raw: string | undefined | null, name = "TRUSTED_ORIGINS"): string[] {
  const out: string[] = [];
  const bad: number[] = [];
  String(raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, index) => {
      const origin = normalizeOrigin(part);
      if (!origin) bad.push(index + 1);
      else if (!out.includes(origin)) out.push(origin);
    });
  if (bad.length) {
    throw new TrustedOriginsError(
      `${name} has ${bad.length} invalid entr${bad.length === 1 ? "y" : "ies"} (position ${bad.join(", ")}). Use comma-separated origins like https://example.com.`,
    );
  }
  return out;
}

/**
 * Trusted origins for an explicit deploy: BETTER_AUTH_URL, APP_URL (when it
 * differs), TRUSTED_ORIGINS, then local dev. Deduped, order kept.
 */
export function deployedTrustedOrigins(
  env: Record<string, string | undefined>,
  baseURL: string,
  localDev: readonly string[] = [],
): string[] {
  const list = [
    normalizeOrigin(baseURL) ?? baseURL,
    normalizeOrigin(env.APP_URL ?? "") ?? "",
    ...parseTrustedOrigins(env.TRUSTED_ORIGINS),
    ...localDev,
  ].filter(Boolean);
  return [...new Set(list)];
}
