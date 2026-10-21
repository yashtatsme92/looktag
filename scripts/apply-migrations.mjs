// @ts-check
/**
 * Apply versioned SQL files once, under a Postgres advisory lock.
 * Shared by `scripts/migrate.mjs` (node-postgres) and the hermetic PGLite test.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { backfillLookCrops } from "./backfill-look-crops.mjs";
import {
  candidateMigrationPaths,
  pendingMigrations,
} from "./migration-plan.mjs";

/** Stable lock key. Held on one connection for the whole migrate. */
export const MIGRATE_ADVISORY_LOCK = 814763521;

/**
 * @param {string | undefined} raw
 */
export function authEnabledFromEnv(raw) {
  return raw !== "false";
}

/**
 * @param {string} migrationsDir
 * @param {{ authEnabled?: boolean }} [options]
 */
export async function readMigrationFiles(migrationsDir, options = {}) {
  const authEnabled = options.authEnabled !== false;
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    return [];
  }
  const includeAuthFile = authEnabled && existsSync(join(migrationsDir, "auth", "0001_auth.sql"));
  const paths = candidateMigrationPaths(entries, { authEnabled, includeAuthFile });
  const plan = pendingMigrations(paths, [], { authEnabled });
  /** @type {Array<{ name: string, path: string, text: string }>} */
  const files = [];
  for (const item of plan) {
    files.push({
      ...item,
      text: await readFile(join(migrationsDir, item.path), "utf8"),
    });
  }
  return files;
}

/**
 * @param {{
 *   query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
 *   exec: (text: string) => Promise<unknown>,
 * }} db
 * @param {Array<{ name: string, path: string, text: string }>} files
 * @param {{ authEnabled?: boolean, lock?: boolean }} [options]
 */
export async function applyMigrations(db, files, options = {}) {
  const lock = options.lock !== false;
  const authEnabled = options.authEnabled !== false;
  if (lock) {
    await db.query("select pg_advisory_lock($1::bigint)", [MIGRATE_ADVISORY_LOCK]);
  }
  try {
    await db.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const appliedRows = await db.query("select name from _migrations");
    const applied = appliedRows.rows.map((row) => String(row.name));
    const pending = pendingMigrations(
      files.map((file) => file.path),
      applied,
      { authEnabled },
    );
    const byPath = new Map(files.map((file) => [file.path, file]));
    let count = 0;
    for (const item of pending) {
      const file = byPath.get(item.path);
      if (!file) continue;
      try {
        await db.query("begin");
        await db.exec(file.text);
        await db.query("insert into _migrations (name) values ($1)", [file.name]);
        await db.query("commit");
      } catch (err) {
        try {
          await db.query("rollback");
        } catch {
          // The connection may already be dead.
        }
        const wrapped = err instanceof Error ? err : new Error(String(err));
        wrapped.message = `error applying ${file.name}: ${wrapped.message}`;
        throw wrapped;
      }
      count += 1;
    }
    return count;
  } finally {
    if (lock) {
      try {
        await db.query("select pg_advisory_unlock($1::bigint)", [MIGRATE_ADVISORY_LOCK]);
      } catch {
        // Unlock is best-effort; the session end releases the lock.
      }
    }
  }
}

/**
 * @param {{
 *   query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
 *   exec: (text: string) => Promise<unknown>,
 * }} db
 * @param {{ migrationsDir: string, authEnabled?: boolean, lock?: boolean }} options
 */
export async function runMigrate(db, options) {
  const authEnabled = options.authEnabled !== false;
  const files = await readMigrationFiles(options.migrationsDir, { authEnabled });
  if (files.length === 0) return { applied: 0, crops: 0 };
  const applied = await applyMigrations(db, files, { authEnabled, lock: options.lock });
  const crops = await backfillLookCrops({
    query: async (text, params = []) => {
      const result = await db.query(text, params);
      return /** @type {Array<{ id: string, image_src: string }>} */ (result.rows);
    },
  });
  return { applied, crops: crops ?? 0 };
}
