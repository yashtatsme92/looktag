import { assertProductionDatabase } from "../../../../scripts/pg-pool.mjs";

type Env = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DB_PROVIDER?: string;
  LOOKTAG_ALLOW_EPHEMERAL_DB?: string;
  ALLOW_EPHEMERAL_DB?: string;
};

/**
 * Production without a database exits unless the process opted into PGLite.
 * `DB_PROVIDER=pglite` is that choice even when `DATABASE_URL` is also set:
 * the named provider wins, and this guard does not treat the URL as the driver.
 */
export function refuseEphemeralDatabase(env: Env = process.env): void {
  if (env.DB_PROVIDER?.trim().toLowerCase() === "pglite") return;
  assertProductionDatabase({
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
    LOOKTAG_ALLOW_EPHEMERAL_DB: env.LOOKTAG_ALLOW_EPHEMERAL_DB,
    ALLOW_EPHEMERAL_DB: env.ALLOW_EPHEMERAL_DB,
  });
}
