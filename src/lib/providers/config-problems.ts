export type EnvProblem = { name: string; problem: "missing" | "invalid" };

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

function httpsOrLoopback(value: string): boolean {
  if (value.startsWith("https://")) return true;
  return LOOPBACK.test(value);
}

/**
 * Production configuration problems. Names only — never values.
 * This module has no other imports so the container entrypoint can load it
 * without the rest of the provider tree. Non-production returns an empty list
 * so local PGLite and tests keep booting.
 */
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: EnvProblem[] = [];
  const auth = trim(env.AUTH_PROVIDER).toLowerCase();
  if (auth && auth !== "better-auth" && auth !== "grok") {
    problems.push({ name: "AUTH_PROVIDER", problem: "invalid" });
  }
  const chrome = trim(env.PLATFORM_CHROME).toLowerCase();
  if (chrome && chrome !== "grok" && chrome !== "none") {
    problems.push({ name: "PLATFORM_CHROME", problem: "invalid" });
  }
  const optIn = trim(env.LOOKTAG_ALLOW_EPHEMERAL_DB || env.ALLOW_EPHEMERAL_DB);
  const ephemeral = optIn === "1" || optIn === "true";
  const provider = trim(env.DB_PROVIDER).toLowerCase();
  if ((provider === "pglite" || provider === "embedded") && !ephemeral) {
    problems.push({ name: "DB_PROVIDER", problem: "invalid" });
  }
  if (!trim(env.DATABASE_URL) && !ephemeral) {
    problems.push({ name: "DATABASE_URL", problem: "missing" });
  }
  if (!trim(env.BETTER_AUTH_SECRET)) problems.push({ name: "BETTER_AUTH_SECRET", problem: "missing" });
  const authUrl = trim(env.BETTER_AUTH_URL);
  if (!authUrl) problems.push({ name: "BETTER_AUTH_URL", problem: "missing" });
  else if (!httpsOrLoopback(authUrl)) problems.push({ name: "BETTER_AUTH_URL", problem: "invalid" });
  const appUrl = trim(env.APP_URL);
  if (!appUrl) problems.push({ name: "APP_URL", problem: "missing" });
  else if (!httpsOrLoopback(appUrl)) problems.push({ name: "APP_URL", problem: "invalid" });
  if ((auth || "better-auth") === "grok") {
    if (!trim(env.GROK_AUTH_CLIENT_ID)) problems.push({ name: "GROK_AUTH_CLIENT_ID", problem: "missing" });
    if (!trim(env.GROK_AUTH_CLIENT_SECRET)) problems.push({ name: "GROK_AUTH_CLIENT_SECRET", problem: "missing" });
  }
  const storage = trim(env.STORAGE_PROVIDER).toLowerCase();
  if (storage === "s3" || storage === "r2") {
    for (const name of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!trim(env[name])) problems.push({ name, problem: "missing" });
    }
    if (storage === "r2" && !trim(env.S3_ENDPOINT)) {
      problems.push({ name: "S3_ENDPOINT", problem: "missing" });
    }
  }
  return problems;
}

export function problemNames(problems: EnvProblem[]): string[] {
  return problems.map((item) => item.name);
}
