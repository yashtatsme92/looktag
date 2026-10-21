import pg from "pg";
import { openSharedPool, postgresPoolOptions } from "../../../../scripts/pg-pool.mjs";

/** The process-wide pool. App queries and Better Auth share this instance. */
export function getSharedPgPool(connectionString: string) {
  return openSharedPool(connectionString, pg);
}

/** A short-lived pool for migrate and seed. The caller must `end()` it. */
export function openDedicatedPool(connectionString: string) {
  return new pg.Pool({ ...postgresPoolOptions(connectionString), max: 1 });
}
