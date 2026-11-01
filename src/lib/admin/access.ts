export const ADMIN_USER_ID = "admin";
/** Default allowlist address when `ADMIN_EMAIL` is unset. */
export const DEFAULT_ADMIN_EMAIL = "hello@thelooktag.com";
/**
 * Old published mailbox. Kept so docs and migration notes can name it.
 * It is not an admin unless it is listed in the environment.
 */
export const LEGACY_ADMIN_EMAIL = "admin@looktag.studio";
export const ADMIN_NAME = "Admin";

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  return typeof process !== "undefined" ? process.env : {};
}

function envTrim(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function isTruthyFlag(value: string | undefined): boolean {
  const flag = value?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * Admin email used when bootstrapping. Prefers `ADMIN_EMAIL` from the
 * environment; falls back to {@link DEFAULT_ADMIN_EMAIL}.
 */
export function resolveAdminEmail(env: Env = defaultEnv()): string {
  return envTrim(env, "ADMIN_EMAIL") ?? DEFAULT_ADMIN_EMAIL;
}

/** Split a comma-separated mailbox list. Trims, lowercases, and drops dupes. */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** `ADMIN_EMAILS` plus the resolved `ADMIN_EMAIL` (or the default). */
export function adminEmailAllowlist(env: Env = defaultEnv()): string[] {
  const list = parseAdminEmails(env.ADMIN_EMAILS);
  const primary = resolveAdminEmail(env).trim().toLowerCase();
  if (primary && !list.includes(primary)) list.push(primary);
  return list;
}

/**
 * Whether `ensureAdminUser` may insert an admin credential account.
 *
 * Requires `ADMIN_BOOTSTRAP_PASSWORD`. In `NODE_ENV=production` also requires
 * an explicit `ADMIN_BOOTSTRAP=1|true|yes` flag. Never seeds from a hardcoded
 * password.
 */
export function shouldBootstrapAdmin(env: Env = defaultEnv()): boolean {
  if (!envTrim(env, "ADMIN_BOOTSTRAP_PASSWORD")) return false;
  if (env.NODE_ENV === "production") return isTruthyFlag(env.ADMIN_BOOTSTRAP);
  return true;
}

export function resolveBootstrapPassword(env: Env = defaultEnv()): string | undefined {
  return envTrim(env, "ADMIN_BOOTSTRAP_PASSWORD");
}

export function normalizeLoginEmail(raw: string, env: Env = defaultEnv()): string {
  const value = raw.trim().toLowerCase();
  if (value === "admin") return resolveAdminEmail(env);
  return raw.trim();
}

/** Allowlisted mailbox. The legacy address and the bare `admin` alias are not admin. */
export function isAdminEmail(email: string | null | undefined, env: Env = defaultEnv()): boolean {
  const value = (email ?? "").trim().toLowerCase();
  if (!value) return false;
  return adminEmailAllowlist(env).includes(value);
}

export type AdminUserLike = {
  email?: string | null;
  emailVerified?: boolean | null;
};

/** Authoritative admin check: allowlisted and verified. Email/password sign-ups are not. */
export function isAdminUser(user: AdminUserLike | null | undefined, env: Env = defaultEnv()): boolean {
  if (!user || user.emailVerified !== true) return false;
  return isAdminEmail(user.email, env);
}

export type AdminConfigStatus = {
  /** `ADMIN_EMAIL` or `ADMIN_EMAILS` is set to a non-empty value. */
  explicit: boolean;
  bootstrap: boolean;
  allowlist: string[];
  defaultEmail: string;
};

export function adminConfigStatus(env: Env = defaultEnv()): AdminConfigStatus {
  return {
    explicit: Boolean(envTrim(env, "ADMIN_EMAIL") || envTrim(env, "ADMIN_EMAILS")),
    bootstrap: shouldBootstrapAdmin(env),
    allowlist: adminEmailAllowlist(env),
    defaultEmail: DEFAULT_ADMIN_EMAIL,
  };
}

export type YouSessionState = "pending" | "guest" | "member" | "admin";

export type YouSessionInput = {
  isPending: boolean;
  user: { primaryEmail: string | null } | null;
};

export function resolveYouSessionState(input: YouSessionInput, env: Env = defaultEnv()): YouSessionState {
  if (input.isPending) return "pending";
  if (!input.user) return "guest";
  return isAdminEmail(input.user.primaryEmail, env) ? "admin" : "member";
}

export function youSessionSignedIn(state: YouSessionState): boolean {
  return state === "member" || state === "admin";
}
