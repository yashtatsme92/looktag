/**
 * Server-only preview env captured at build time.
 *
 * Stays `null` for Render and for the client bundle. A Netlify preview build
 * rewrites the initializer in non-client environments (see
 * `rewriteBakedPreviewEnvModule`). Netlify functions do not receive
 * `netlify.toml` or build-shell variables, so the server installs this object
 * onto `process.env` before anything reads `DATABASE_URL` or `BETTER_AUTH_URL`.
 */
export const bakedPreviewEnv: Record<string, string> | null = null;

/** Copy baked keys into `env` only where the live value is missing or blank. */
export function installBakedPreviewEnv(
  env: NodeJS.ProcessEnv,
  baked: Readonly<Record<string, string>> | null = bakedPreviewEnv,
): void {
  if (!baked) return;
  for (const [key, value] of Object.entries(baked)) {
    if (!value) continue;
    const live = env[key];
    if (typeof live !== "string" || live.trim() === "") env[key] = value;
  }
}
