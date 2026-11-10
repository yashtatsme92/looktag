/**
 * Looktag configuration registry.
 *
 * Two layers:
 *   1. Environment — picks the database backend and live integrations.
 *   2. Studio (`looktag_settings`) — sign-up, Houses, search, rank. Column
 *      flags plus `extras_json` so a new knob is a key in EXTRAS_KEYS, not
 *      a migration.
 *
 * Edit Studio at `/admin/studio`. Prefer host-injected secrets; see `.env.example`
 * for local placeholders. Unset `DATABASE_URL` uses embedded PGLite (migrations
 * still apply).
 */
import { DEFAULT_SETTINGS, EXTRAS_KEYS } from "./settings/model.ts";

export const STUDIO_COLUMNS = [
  "signupEmail",
  "signupGoogle",
  "signupX",
  "labelsEnabled",
] as const;

export type StudioColumn = (typeof STUDIO_COLUMNS)[number];

export type Integration = {
  env: string;
  role: string;
  required: boolean;
  fallback: string;
};

export const INTEGRATIONS = [
  {
    env: "DATABASE_URL",
    role: "Postgres connection (Neon, RDS, or any Postgres). Unset uses embedded PGLite.",
    required: false,
    fallback: "pglite",
  },
  {
    env: "BETTER_AUTH_SECRET",
    role: "Better Auth signing secret. Required for durable production sessions.",
    required: true,
    fallback: "ephemeral preview secret",
  },
  {
    env: "BETTER_AUTH_URL",
    role: "Public Better Auth origin (OAuth redirect / CSRF).",
    required: true,
    fallback: "dynamic preview / localhost",
  },
  {
    env: "APP_URL",
    role: "Canonical public origin, e.g. https://thelooktag.com. Every absolute URL (canonical, OG, sitemap, robots, share links, email links) is built from it, never from the request host.",
    required: false,
    fallback: "request origin (local dev / previews only)",
  },
  {
    env: "TRUSTED_ORIGINS",
    role: "Extra comma-separated origins Better Auth accepts (e.g. the previous host during a domain move). Invalid entries fail boot.",
    required: false,
    fallback: "none",
  },
  {
    env: "CONTACT_EMAIL",
    role: "Public contact mailbox for the footer Contact link and legal pages.",
    required: false,
    fallback: "hello@thelooktag.com",
  },
  {
    env: "FOOTER_LINKS_ENABLED",
    role: "Comma-separated footer link ids to force on (impressum, privacy, terms, contact, about, instagram, tiktok, x, domain). Empty = only Admin toggles, all off by default.",
    required: false,
    fallback: "empty (every link off)",
  },
  {
    env: "SITE_REDIRECT_TO_CANONICAL",
    role: "Set to 1 to 301 any non-APP_URL host to APP_URL (auth routes on TRUSTED_ORIGINS hosts are exempt).",
    required: false,
    fallback: "off",
  },
  {
    env: "GROK_AUTH_ISSUER",
    role: "Grok auth broker issuer URL.",
    required: false,
    fallback: "https://auth.grok.me",
  },
  {
    env: "GROK_AUTH_CLIENT_ID",
    role: "Per-app Grok auth broker client id.",
    required: false,
    fallback: "shared preview client",
  },
  {
    env: "GROK_AUTH_CLIENT_SECRET",
    role: "Per-app Grok auth broker client secret.",
    required: false,
    fallback: "shared preview client",
  },
  {
    env: "ADMIN_EMAIL",
    role: "Single admin mailbox. Included in the allowlist and used for bootstrap.",
    required: false,
    fallback: "hello@thelooktag.com",
  },
  {
    env: "ADMIN_EMAILS",
    role: "Comma-separated admin allowlist. Google sign-in only; email/password sign-ups are never admin.",
    required: false,
    fallback: "hello@thelooktag.com",
  },
  {
    env: "ADMIN_BOOTSTRAP_PASSWORD",
    role: "One-time password used only when bootstrapping the admin user.",
    required: false,
    fallback: "no admin seed",
  },
  {
    env: "ADMIN_BOOTSTRAP",
    role: "Explicit bootstrap flag (required in production together with ADMIN_BOOTSTRAP_PASSWORD).",
    required: false,
    fallback: "disabled",
  },
  {
    env: "XAI_API_KEY",
    role: "Grok shop search and look suggestions from a photo.",
    required: false,
    fallback: "search engines that do not need a key",
  },
  {
    env: "OTEL_EXPORTER_OTLP_ENDPOINT",
    role: "Traces, metrics, and logs collector.",
    required: false,
    fallback: "Signals page only",
  },
  {
    env: "LOOKTAG_NATIVE_URL",
    role: "Hosted origin wrapped by the Capacitor shell.",
    required: false,
    fallback: "local public/",
  },
  {
    env: "VITE_AUTH_ENABLED",
    role: "Account sign-in. Set via .grok/app-env.json, not a committed .env file.",
    required: false,
    fallback: "true",
  },
  {
    env: "STORAGE_PROVIDER",
    role: "Look photo store: local, s3, or r2. r2 uses the S3 adapter.",
    required: false,
    fallback: "local",
  },
  {
    env: "S3_ENDPOINT",
    role: "S3-compatible endpoint. Required for Cloudflare R2.",
    required: false,
    fallback: "AWS regional endpoint when STORAGE_PROVIDER=s3",
  },
  {
    env: "S3_BUCKET",
    role: "Bucket that holds look photo derivatives.",
    required: false,
    fallback: "looktag-photos",
  },
  {
    env: "S3_ACCESS_KEY_ID",
    role: "S3/R2 access key. Unused when STORAGE_PROVIDER=local.",
    required: false,
    fallback: "local disk",
  },
  {
    env: "S3_SECRET_ACCESS_KEY",
    role: "S3/R2 secret key. Unused when STORAGE_PROVIDER=local.",
    required: false,
    fallback: "local disk",
  },
  {
    env: "S3_REGION",
    role: "S3 signing region. Use auto for R2.",
    required: false,
    fallback: "auto",
  },
  {
    env: "STORAGE_PUBLIC_BASE_URL",
    role: "Public origin for look photos, for example https://img.thelooktag.com.",
    required: false,
    fallback: "/storage on local",
  },
  {
    env: "LOOK_IMAGE_AVIF",
    role: "Set to 1 to also store AVIF derivatives. Off keeps upload and backfill on WebP and JPEG.",
    required: false,
    fallback: "off",
  },
] as const satisfies readonly Integration[];

export const MIGRATIONS_DIR = "migrations";

export const SETTINGS_TABLE = "looktag_settings";

export const CONFIG_DEFAULTS = DEFAULT_SETTINGS;

export const CONFIG_EXTRAS_KEYS = EXTRAS_KEYS;

export function integrationStatus(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): Record<(typeof INTEGRATIONS)[number]["env"], boolean> {
  const status = {} as Record<(typeof INTEGRATIONS)[number]["env"], boolean>;
  for (const item of INTEGRATIONS) {
    status[item.env] = Boolean(env[item.env]?.trim());
  }
  return status;
}

export function databaseBackend(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): "postgres" | "pglite" {
  return env.DATABASE_URL?.trim() ? "postgres" : "pglite";
}
