#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * Runs during `npm run build` on any host — applying pending files
 * in ../migrations to DATABASE_URL. Each file is applied in one transaction and
 * recorded in a `_migrations` table, so it runs once and is safe to re-run.
 * A Postgres advisory lock keeps two deploys from applying the same file.
 * A direct connection holds `pg_advisory_lock` for the whole run. Neon's
 * pooled (`-pooler`) endpoint cannot keep a session lock, so each file takes
 * `pg_advisory_xact_lock` inside its transaction instead.
 *
 * When sign-in is on (`VITE_AUTH_ENABLED` is not `"false"`, matching Better
 * Auth), `migrations/auth/0001_auth.sql` is included. The top-level copy
 * `migrations/0001_auth.sql` is what PGLite applies; basename dedupe means a
 * fresh database runs that schema once. Sign-in off skips it.
 *
 * After the files, centred look crops are backfilled the same way PGLite does
 * at startup (`src/lib/db.ts`).
 *
 * No DATABASE_URL (local / preview / CI) -> skip; the PGLite fallback migrates
 * itself. Seed data is a separate step: `npm run db:seed`.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { authEnabledFromEnv, runMigrate } from "./apply-migrations.mjs";
import { migrationLockMode } from "../src/lib/providers/db/neon-pooler.ts";
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log(
    "[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).",
  );
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const authEnabled = authEnabledFromEnv(process.env.VITE_AUTH_ENABLED);

async function main() {
  const pool = openDedicatedPool(databaseUrl);
  const client = await pool.connect();
  const db = {
    query: (text, params) => client.query(text, params),
    exec: (text) => client.query(text),
  };
  try {
    const { applied, crops } = await runMigrate(db, {
      migrationsDir,
      authEnabled,
      lockMode: migrationLockMode(databaseUrl),
    });
    if (crops) console.log(`[migrate] backfilled ${crops} centred look crop(s).`);
    console.log(
      applied ? `[migrate] done — ${applied} migration(s) applied.` : "[migrate] up to date.",
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});
