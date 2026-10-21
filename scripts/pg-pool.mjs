// @ts-check
/**
 * Shared node-postgres pool. App queries and Better Auth must use
 * `getSharedPgPool` so a deployed process does not open two pools.
 * Connection strings are never logged.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;

/** @param {string | undefined | null} raw */
export function resolveDbSource(raw) {
  return raw && String(raw).trim() ? "neon" : "pglite";
}

/**
 * @param {string} connectionString
 */
export function postgresPoolOptions(connectionString) {
  const match = connectionString.match(/[?&]sslmode=([^&]+)/i);
  const mode = match?.[1]?.toLowerCase();
  /** @type {{ connectionString: string, max: number, idleTimeoutMillis: number, ssl?: { rejectUnauthorized: boolean } }} */
  const options = {
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
  };
  if (mode === "require" || mode === "prefer" || mode === "verify-ca" || mode === "verify-full") {
    options.ssl = { rejectUnauthorized: mode === "verify-full" || mode === "verify-ca" };
  }
  return options;
}

/**
 * Neon’s `-pooler` host is PgBouncer in transaction mode. A session
 * `pg_advisory_lock` ends with that backend as soon as the statement does,
 * so it does not cover the rest of the migrate. Direct connections and PGLite
 * can hold a session lock for the whole run.
 * The connection string is never logged.
 * @param {string | undefined | null} connectionString
 * @returns {"session" | "transaction"}
 */
export function migrationLockMode(connectionString) {
  if (!connectionString || !String(connectionString).trim()) return "session";
  const raw = String(connectionString).trim();
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    const at = raw.lastIndexOf("@");
    const rest = at >= 0 ? raw.slice(at + 1) : raw;
    host = rest.split("/")[0]?.split("?")[0] ?? "";
  }
  const name = host.toLowerCase();
  if (name.includes("-pooler") || name.startsWith("pooler.")) return "transaction";
  return "session";
}

/**
 * One factory call, then the same instance. Used by tests to prove the pool is shared.
 * @template T
 * @param {() => T} factory
 */
export function singleton(factory) {
  /** @type {{ value?: T, ready: boolean }} */
  const slot = { ready: false };
  return () => {
    if (!slot.ready) {
      slot.value = factory();
      slot.ready = true;
    }
    return /** @type {T} */ (slot.value);
  };
}

/** @type {{ pool?: import("pg").Pool, url?: string, parsers?: boolean }} */
const shared = {};

/**
 * @param {string} connectionString
 * @param {{ Pool: new (config: object) => import("pg").Pool, types: { setTypeParser: Function } }} pgModule
 */
export function openSharedPool(connectionString, pgModule) {
  if (shared.pool) {
    if (shared.url !== connectionString) {
      throw new Error("DATABASE_URL changed after the shared Postgres pool was created");
    }
    return shared.pool;
  }
  if (!shared.parsers) {
    const identity = (/** @type {string} */ value) => value;
    pgModule.types.setTypeParser(OID_INT8, Number);
    pgModule.types.setTypeParser(OID_DATE, identity);
    pgModule.types.setTypeParser(OID_INTERVAL, identity);
    shared.parsers = true;
  }
  shared.url = connectionString;
  shared.pool = new pgModule.Pool(postgresPoolOptions(connectionString));
  return shared.pool;
}

/**
 * One pool per process. The first caller creates it; later callers get the same pool.
 * @param {string} connectionString
 */
export function getSharedPgPool(connectionString) {
  const pg = require("pg");
  return openSharedPool(connectionString, pg);
}

const warned = { done: false };

/**
 * Production without DATABASE_URL keeps booting (CI's prod-server job does
 * that) but says so once. The message never includes a URL.
 * @param {{ NODE_ENV?: string, DATABASE_URL?: string }} env
 * @param {(message: string) => void} [warn]
 * @param {{ done: boolean }} [flag]
 */
export function warnIfProductionWithoutDatabase(env, warn = console.warn, flag = warned) {
  const missing = resolveDbSource(env.DATABASE_URL) === "pglite";
  if (env.NODE_ENV !== "production" || !missing || flag.done) return false;
  flag.done = true;
  warn(
    "[db] DATABASE_URL is not set. This production process is using embedded PGLite, which does not persist across restarts. Set DATABASE_URL to the Neon pooled connection string (host contains -pooler, sslmode=require).",
  );
  return true;
}
