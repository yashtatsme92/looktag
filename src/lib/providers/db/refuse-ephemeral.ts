import { assertProductionDatabase } from "../../../../scripts/pg-pool.mjs";

type Env = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DB_PROVIDER?: string;
  LOOKTAG_ALLOW_EPHEMERAL_DB?: string;
  ALLOW_EPHEMERAL_DB?: string;
};

const warned = globalThis as typeof globalThis & { __looktagIgnoredDatabaseUrl?: boolean };

function optedIntoEphemeral(env: Env): boolean {
  const optIn = env.LOOKTAG_ALLOW_EPHEMERAL_DB ?? env.ALLOW_EPHEMERAL_DB;
  return optIn === "1" || optIn === "true";
}

/**
 * Production on in-memory PGLite exits unless the process opted in.
 * `DB_PROVIDER=pglite` still selects that database when `DATABASE_URL` is set
 * (the URL is ignored, and a warning says so). It does not skip this guard.
 */
export function refuseEphemeralDatabase(env: Env = process.env): void {
  const provider = env.DB_PROVIDER?.trim().toLowerCase();
  const url = env.DATABASE_URL?.trim() ?? "";
  const explicitPglite = provider === "pglite";
  if (explicitPglite && url && !warned.__looktagIgnoredDatabaseUrl) {
    warned.__looktagIgnoredDatabaseUrl = true;
    console.warn("[db] DB_PROVIDER=pglite ignores DATABASE_URL. The embedded database is used instead.");
  }
  if (explicitPglite) {
    if (env.NODE_ENV !== "production" || optedIntoEphemeral(env)) return;
    throw new Error(
      "[db] DB_PROVIDER=pglite uses in-memory PGLite. Production will not boot on it because that data is lost on restart. Set LOOKTAG_ALLOW_EPHEMERAL_DB=1 to opt in.",
    );
  }
  assertProductionDatabase({
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
    LOOKTAG_ALLOW_EPHEMERAL_DB: env.LOOKTAG_ALLOW_EPHEMERAL_DB,
    ALLOW_EPHEMERAL_DB: env.ALLOW_EPHEMERAL_DB,
  });
}
