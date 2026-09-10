export const ADMIN_USER_ID = "admin";
/** Canonical admin mailbox for identity checks and default bootstrap. */
export const ADMIN_EMAIL = "admin@looktag.studio";
export const ADMIN_NAME = "Admin";

function envTrim(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function isTruthyFlag(value: string | undefined): boolean {
  const flag = value?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * Admin email used when bootstrapping. Prefers `ADMIN_EMAIL` from the
 * environment; falls back to {@link ADMIN_EMAIL}.
 */
export function resolveAdminEmail(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): string {
  return envTrim(env, "ADMIN_EMAIL") ?? ADMIN_EMAIL;
}

/**
 * Whether `ensureAdminUser` may insert an admin credential account.
 *
 * Requires `ADMIN_BOOTSTRAP_PASSWORD`. In `NODE_ENV=production` also requires
 * an explicit `ADMIN_BOOTSTRAP=1|true|yes` flag. Never seeds from a hardcoded
 * password.
 */
export function shouldBootstrapAdmin(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): boolean {
  if (!envTrim(env, "ADMIN_BOOTSTRAP_PASSWORD")) return false;
  if (env.NODE_ENV === "production") return isTruthyFlag(env.ADMIN_BOOTSTRAP);
  return true;
}

export function resolveBootstrapPassword(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): string | undefined {
  return envTrim(env, "ADMIN_BOOTSTRAP_PASSWORD");
}

export function normalizeLoginEmail(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === "admin") return resolveAdminEmail();
  return raw.trim();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const value = (email ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value === "admin") return true;
  if (value === ADMIN_EMAIL) return true;
  const configured =
    typeof process !== "undefined" ? envTrim(process.env, "ADMIN_EMAIL") : undefined;
  if (configured && value === configured.toLowerCase()) return true;
  return false;
}
