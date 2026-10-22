// @ts-check
/**
 * Shared node-postgres pool. App queries and Better Auth must use
 * `getSharedPgPool` so a deployed process does not open two pools.
 * Connection strings are never logged.
 */

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;

/** @param {string | undefined | null} raw */
export function resolveDbSource(raw) {
  const text = raw == null ? "" : String(raw).trim();
  if (!text) return "pglite";
  const named = text.toLowerCase();
  // "neon" is a legacy alias for any Postgres backend.
  if (named === "neon" || named === "postgres") return "postgres";
  if (named === "pglite") return "pglite";
  return "postgres";
}

/**
 * @param {string | undefined | null} source
 * @returns {"postgres" | "pglite"}
 */
export function normalizeDbSource(source) {
  if (source === "neon" || source === "postgres") return "postgres";
  return "pglite";
}

/**
 * Drop `sslmode` so node-postgres cannot replace an explicit `ssl` option.
 * pg-connection-string overwrites `ssl` from the URL, and a future pg will
 * treat `sslmode=require` as unverified.
 * @param {string} connectionString
 */
function stripSslMode(connectionString) {
  return connectionString
    .replace(/([?&])sslmode=[^&]*&/gi, "$1")
    .replace(/([?&])sslmode=[^&]*$/i, "")
    .replace(/\?$/, "");
}

/**
 * @param {string} connectionString
 * @param {Record<string, string | undefined>} [env]
 */
export function postgresPoolOptions(connectionString, env = process.env) {
  const match = connectionString.match(/[?&]sslmode=([^&]+)/i);
  const mode = match?.[1]?.toLowerCase();
  const noVerify = mode === "no-verify" || env.DATABASE_SSL_NO_VERIFY === "1";
  /** @type {{ connectionString: string, max: number, idleTimeoutMillis: number, ssl?: { rejectUnauthorized: boolean } | false }} */
  const options = {
    connectionString: stripSslMode(connectionString),
    max: 5,
    idleTimeoutMillis: 10_000,
  };
  if (mode === "disable") {
    options.ssl = false;
    return options;
  }
  const encrypted =
    noVerify ||
    mode === "require" ||
    mode === "prefer" ||
    mode === "verify-ca" ||
    mode === "verify-full";
  if (encrypted) {
    // Neon serves a public certificate. Verification stays on unless the URL
    // says sslmode=no-verify or DATABASE_SSL_NO_VERIFY=1 (local opt-in).
    options.ssl = { rejectUnauthorized: !noVerify };
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
 * One pool per process. Implemented in the Postgres adapter, which is the
 * only module allowed to import `pg`. This file stays driver-free.
 */

/**
 * Production without DATABASE_URL must not boot on in-memory PGLite.
 * CI's prod-server job opts in with LOOKTAG_ALLOW_EPHEMERAL_DB=1.
 * The error never includes a URL.
 * @param {{
 *   NODE_ENV?: string,
 *   DATABASE_URL?: string,
 *   LOOKTAG_ALLOW_EPHEMERAL_DB?: string,
 *   ALLOW_EPHEMERAL_DB?: string,
 * }} env
 */
export function assertProductionDatabase(env) {
  if (env.NODE_ENV !== "production") return;
  if (resolveDbSource(env.DATABASE_URL) !== "pglite") return;
  const optIn = env.LOOKTAG_ALLOW_EPHEMERAL_DB ?? env.ALLOW_EPHEMERAL_DB;
  if (optIn === "1" || optIn === "true") return;
  throw new Error(
    "[db] DATABASE_URL is not set. Production will not boot on in-memory PGLite because that data is lost on restart. Set DATABASE_URL, or set LOOKTAG_ALLOW_EPHEMERAL_DB=1 to opt in.",
  );
}
