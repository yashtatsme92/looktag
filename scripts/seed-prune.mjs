#!/usr/bin/env node
/**
 * Delete looks that are not in the seed ledger, and the image, crop, and
 * offers stored on those rows. Dry run unless `--confirm` is passed.
 * Refuses NODE_ENV=production unless `--allow-production` is also passed.
 * Never point this at a real database.
 *
 *   npm run db:seed:prune
 *   npm run db:seed:prune -- --confirm
 */
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";
import { auditDatabase } from "./seed-audit.mjs";

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} argv
 */
export function pruneGuard(env, argv) {
  const confirm = argv.includes("--confirm");
  const allowProduction = argv.includes("--allow-production");
  if (env.NODE_ENV === "production" && !allowProduction) {
    return {
      ok: false,
      confirm,
      error: "Refusing to prune when NODE_ENV=production. Pass --allow-production to override. Do not point this at a real database.",
    };
  }
  return { ok: true, confirm, error: "" };
}

/**
 * @param {(text: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 * @param {{ confirm: boolean }} options
 */
export async function pruneUnseededLooks(query, options) {
  const rows = await auditDatabase(query);
  const looks = rows.filter((row) => row.kind === "look" && !row.seeded).map((row) => row.id);
  if (!options.confirm) {
    return { dryRun: true, looks };
  }
  for (const id of looks) {
    await query("delete from looks where id = $1", [id]);
  }
  return { dryRun: false, looks };
}

/** @param {{ dryRun: boolean, looks: string[] }} result */
export function formatPrune(result) {
  const mode = result.dryRun ? "dry-run" : "deleted";
  const lines = [`${mode} ${result.looks.length} not-seeded look(s)`];
  for (const id of result.looks) {
    lines.push(`  ${mode} ${id} image crop offers`);
  }
  return lines.join("\n");
}

/** @param {string} text */
function safeError(text) {
  if (/postgres(ql)?:\/\//i.test(text)) return "database connection failed";
  return text;
}

async function main() {
  const guard = pruneGuard(process.env, process.argv.slice(2));
  if (!guard.ok) {
    console.error(`[seed:prune] ${guard.error}`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("[seed:prune] no database configured — nothing to do.");
    return;
  }
  const pool = openDedicatedPool(databaseUrl);
  const client = await pool.connect();
  try {
    const result = await pruneUnseededLooks(
      /** @param {string} text @param {unknown[]} [params] */
      (text, params = []) => client.query(text, params),
      { confirm: guard.confirm },
    );
    console.log(formatPrune(result));
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = process.argv[1]?.endsWith("seed-prune.mjs");
if (isCli) {
  main().catch((err) => {
    console.error("[seed:prune] failed:", safeError(String(err?.message || err)));
    process.exit(1);
  });
}
