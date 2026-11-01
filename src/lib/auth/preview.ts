/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker instead exposes ONE
 * shared "preview" client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`
 * (broker: `app-builder-deployer/auth/src/preview-oauth.ts`). Baking it here lets
 * the live preview do REAL sign-in — no demo/mock users — with no platform
 * injection. When deployed the deployer injects a per-app
 * `GROK_AUTH_*` that overrides these (see `server.ts`).
 *
 * These MUST equal the broker's `GROK_PREVIEW_CLIENT_ID` /
 * `GROK_PREVIEW_CLIENT_SECRET` (set in the broker's Vercel env; the broker stores
 * only the secret's `base64url(SHA-256)` hash). This is a dedicated, low-privilege
 * client (preview-only, `*.grok-sandbox.com`) — rotate it by regenerating the
 * broker env var and this constant together.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";
export const PREVIEW_CLIENT_SECRET =
  "8bcdb7fc5a33874ad933ca568918d5790388a0795e44c4d1dea691f801b17ec5";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;

const NETLIFY_PREVIEW_CONTEXTS = new Set(["deploy-preview", "branch-deploy"]);

/** Initializer `rewriteBakedPreviewEnvModule` replaces. Keep in sync with baked-preview-env.ts. */
export const BAKED_PREVIEW_ENV_MARKER =
  "export const bakedPreviewEnv: Record<string, string> | null = null;";

export const PREVIEW_BAKE_KEYS = [
  "APP_ENV",
  "APP_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "VITE_AUTH_ENABLED",
] as const;

export type PreviewDeployEnv = {
  APP_ENV?: string;
  APP_URL?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  DATABASE_URL?: string;
  VITE_AUTH_ENABLED?: string;
  NETLIFY?: string;
  CONTEXT?: string;
  DEPLOY_PRIME_URL?: string;
  DEPLOY_URL?: string;
  PREVIEW_TRUSTED_HOSTS?: string;
};

const NETLIFY_SITE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** `https://pr-<n>--<site>.netlify.app` for `netlify deploy --alias pr-<n>`. */
export function previewAliasOrigin(pr: string | number, siteName: string): string {
  const n = String(pr).trim();
  const site = siteName.trim();
  if (!/^[1-9]\d*$/.test(n)) {
    throw new Error(
      `Preview PR number must be a positive integer, got ${JSON.stringify(String(pr))}`,
    );
  }
  if (!NETLIFY_SITE_NAME.test(site)) {
    throw new Error(`Netlify site name is not a subdomain label: ${JSON.stringify(siteName)}`);
  }
  return `https://pr-${n}--${site}.netlify.app`;
}

/** Host patterns for preview origins. A bare `*` is rejected; `*.example` is allowed. */
export function parsePreviewTrustedHosts(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const hosts = raw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (hosts.some((host) => host === "*")) {
    throw new Error('PREVIEW_TRUSTED_HOSTS must not contain a bare "*"');
  }
  return hosts;
}

/**
 * Concrete preview origin when Better Auth has no fixed URL.
 * Only Netlify deploy previews and branch deploys qualify.
 * Build-time only: Netlify functions do not receive these variables.
 */
export function netlifyPreviewBaseURL(env: PreviewDeployEnv): string | undefined {
  if (env.BETTER_AUTH_URL?.trim()) return undefined;
  if (env.NETLIFY !== "true") return undefined;
  if (!NETLIFY_PREVIEW_CONTEXTS.has((env.CONTEXT ?? "").trim())) return undefined;
  const raw = env.DEPLOY_PRIME_URL?.trim() || env.DEPLOY_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** True on Netlify (and any host) when APP_ENV=preview. Social brokers stay off. */
export function previewDisablesSocial(env: PreviewDeployEnv): boolean {
  return (env.APP_ENV ?? "").trim() === "preview";
}

/**
 * Register the Grok broker only off preview. Email/password sessions stay on
 * either way — this flag must not flip `authConfigured`.
 */
export function shouldRegisterGrokBroker(env: PreviewDeployEnv): boolean {
  return !previewDisablesSocial(env);
}

/**
 * Signing secret. `APP_ENV=preview` must not mint a per-process secret —
 * Netlify runs more than one function instance. Sandbox (APP_ENV unset) still
 * uses the process-stable fallback.
 */
export function resolveAuthSecret(env: PreviewDeployEnv, fallback: () => string): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if ((env.APP_ENV ?? "").trim() === "preview") {
    throw new Error(
      "BETTER_AUTH_SECRET is required when APP_ENV=preview. Refusing to mint a per-process secret because sessions would break across function instances.",
    );
  }
  return fallback();
}

/**
 * Values to inline when this build is a preview. `null` unless APP_ENV=preview,
 * so a Render build never freezes its runtime env into the bundle.
 * An explicit BETTER_AUTH_URL wins; otherwise the Netlify build-time origin is
 * frozen so the function does not read DEPLOY_PRIME_URL at runtime.
 */
export function collectBakedPreviewEnv(env: PreviewDeployEnv): Record<string, string> | null {
  if ((env.APP_ENV ?? "").trim() !== "preview") return null;
  const baked: Record<string, string> = {};
  for (const key of PREVIEW_BAKE_KEYS) {
    const value = env[key]?.trim();
    if (value) baked[key] = value;
  }
  if (!baked.BETTER_AUTH_URL) {
    const origin = netlifyPreviewBaseURL({ ...env, BETTER_AUTH_URL: undefined });
    if (origin) baked.BETTER_AUTH_URL = origin;
  }
  if (baked.BETTER_AUTH_URL && !baked.APP_URL) baked.APP_URL = baked.BETTER_AUTH_URL;
  return baked;
}

/**
 * Rewrite the baked-env module for a server build. Client environments and
 * non-preview builds are unchanged (`null`).
 */
export function rewriteBakedPreviewEnvModule(
  code: string,
  environmentName: string | undefined,
  env: PreviewDeployEnv,
): string | null {
  if (environmentName === "client") return null;
  if (!code.includes(BAKED_PREVIEW_ENV_MARKER)) return null;
  const baked = collectBakedPreviewEnv(env);
  if (!baked) return null;
  return code.replace(
    BAKED_PREVIEW_ENV_MARKER,
    `export const bakedPreviewEnv: Record<string, string> | null = ${JSON.stringify(baked)};`,
  );
}

/** Fixed base URL for Render, or the Netlify preview origin. Undefined keeps the sandbox dynamic URL. */
export function resolveDeployedBaseURL(env: PreviewDeployEnv): string | undefined {
  const explicit = env.BETTER_AUTH_URL?.trim();
  if (explicit) return explicit;
  return netlifyPreviewBaseURL(env);
}
