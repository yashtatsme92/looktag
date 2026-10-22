import { pendingMigrations } from "../../scripts/migration-plan.mjs";
import { backfillLookCrops } from "../../scripts/backfill-look-crops.mjs";
import { refuseEphemeralDatabase } from "./providers/db/refuse-ephemeral.ts";
import { captureException } from "./providers/errors";
import {
  embeddedAuthDatabase,
  openEmbeddedDb,
  resolveDbProvider,
  sharedPgPool,
  type EmbeddedDb,
} from "./providers/db";
import type { DbSource, Sql } from "./providers/db/types";

export type { DbSource, Sql };

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;

function readDbProvider(): "postgres" | "pglite" {
  if (typeof process === "undefined") return "pglite";
  try {
    return resolveDbProvider({
      DB_PROVIDER: process.env.DB_PROVIDER,
      DATABASE_URL: rawDatabaseUrl,
    });
  } catch (error) {
    const event = process.env.npm_lifecycle_event ?? "";
    if (typeof window === "undefined" && event !== "build" && event !== "typecheck") {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    throw error;
  }
}

const providerName = readDbProvider();
const databaseUrl = providerName === "postgres" ? rawDatabaseUrl?.trim() || undefined : undefined;

/**
 * Active backend. `DB_PROVIDER=pglite` wins even when `DATABASE_URL` is set.
 * That URL is ignored. Production still refuses in-memory PGLite unless
 * `LOOKTAG_ALLOW_EPHEMERAL_DB=1` is set.
 */
export const dbSource: DbSource = databaseUrl ? "postgres" : "pglite";

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<EmbeddedDb>;
  __pgliteMigrateChain__?: Promise<void>;
};

/**
 * Result-type parity: Postgres sends every value as text plus a type OID — the
 * JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
 * int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
 * JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
 * production return identical, JSON-safe shapes:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 */

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

function createPostgresSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    // Same pool Better Auth uses (see getPgPool). Warm instances reuse it.
    const pool = sharedPgPool(databaseUrl!);
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

/** The process-wide Postgres pool. Throws on the PGLite fallback. */
export function getPgPool() {
  if (!databaseUrl) {
    throw new Error("getPgPool() is only available when DATABASE_URL is set");
  }
  return sharedPgPool(databaseUrl);
}

/**
 * Better Auth database: the shared Postgres pool, or the PGLite dialect.
 * Auth does not choose a vendor; this module does.
 */
export function authDatabase() {
  if (databaseUrl) return getPgPool();
  return embeddedAuthDatabase(() => getPglite());
}

async function createPgliteSql(): Promise<Sql> {
  // Embedded Postgres, imported on demand so it never loads on the Neon path.
  // One in-memory instance per process, shared across HMR module instances, so
  // data survives source edits (it resets on dev-server restart).
  globalRef.__pgliteInstance__ ??= (async () => {
    const pg = await openEmbeddedDb();
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  // Apply migrations/ (the single schema source) so preview matches production.
  // SQL is inlined by the bundler via import.meta.glob (no runtime fs); applied
  // files are tracked in _migrations. The glob does not descend, so the opt-in
  // auth schema under migrations/auth/ stays out. Runs once per module instance
  // — so an HMR reload after adding a migration file applies it live — with
  // passes serialized on a global chain so concurrent callers never
  // double-apply.
  const migrate = async (): Promise<void> => {
    const migrations = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations",
    );
    const done = doneRows.rows.map((r) => r.name);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      // Apply + record atomically (parity with scripts/migrate.mjs) so a failed
      // statement can't leave a file half-applied but untracked.
      await pg.transaction(async (tx) => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
    await backfillLookCrops(
      toSql(async <T>(text: string, params: unknown[]) => {
        const result = await pg.query<T>(text, params);
        return result.rows;
      }),
    );
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  return toSql(async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  });
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  return dbSource === "postgres" ? createPostgresSql() : createPgliteSql();
}

/**
 * Get the shared, **server-only** SQL client. Postgres when `DATABASE_URL` is set,
 * otherwise the local PGLite fallback. Memoized — safe to call per request.
 *
 * Schema comes from `migrations/*.sql`, auto-applied before the first query on
 * both backends — define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null; // don't memoize failures — let the next call retry
    throw err;
  });
  return sqlPromise;
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded DB as app data in preview (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set (that path uses Postgres).
 */
export async function getPglite(): Promise<EmbeddedDb> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite** (preview / no `DATABASE_URL`): open the in-memory DB and apply
 *   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
 * - **Postgres**: no-op (pool is created lazily on first query).
 *
 * Vite `configureServer` awaits this at dev startup; production imports of this
 * module kick it off immediately (see bottom of file).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite") return Promise.resolve();
  return getSql().then(() => undefined);
}

if (typeof window === "undefined") {
  try {
    refuseEphemeralDatabase({
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: rawDatabaseUrl,
      DB_PROVIDER: process.env.DB_PROVIDER,
      LOOKTAG_ALLOW_EPHEMERAL_DB: process.env.LOOKTAG_ALLOW_EPHEMERAL_DB,
      ALLOW_EPHEMERAL_DB: process.env.ALLOW_EPHEMERAL_DB,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const event = process.env.npm_lifecycle_event ?? "";
    if (event !== "build" && event !== "typecheck") {
      console.error(message);
      process.exit(1);
    }
    throw error;
  }
}

// Server-only eager start: kick PGLite bootstrap as soon as this module loads in
// Node. Client bundles never hit this path (`getSql` throws in the browser).
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
  __looktagAdminBootstrap__?: Promise<void>;
};
if (typeof window === "undefined" && dbSource === "pglite") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    captureException(err, { where: "[db] PGLite bootstrap failed:" });
    throw err;
  });
}

// Env-gated admin bootstrap at process start (no-op without ADMIN_BOOTSTRAP_PASSWORD;
// production also requires ADMIN_BOOTSTRAP). Never invoked from public handlers.
if (typeof window === "undefined") {
  globalBoot.__looktagAdminBootstrap__ ??= (async () => {
    try {
      const { ensureAdminUser } = await import("./admin/ensure.server");
      await ensureAdminUser(await getSql());
    } catch (error) {
      captureException(error, { where: "[looktag] admin bootstrap skipped:" });
    }
  })();
}
