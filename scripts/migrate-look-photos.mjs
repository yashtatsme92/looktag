#!/usr/bin/env node
/**
 * Move look photos onto the storage provider (#219).
 *
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs --dry-run
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs --rollback
 *
 * Requires DATABASE_URL (the app's Postgres). Seed JPEGs are read from public/looks.
 * Data-URL uploads are decoded from looks.image_src. A backup of the previous
 * image_src values is written to .data/look-photo-migration-backup.json the
 * first time a row changes. Copy that file off the machine before you delete it.
 * Unpublished looks are skipped so they do not become public.
 *
 * Order on Render, after this release is deployed (so 0017_look_image_variants.sql
 * has run) and the storage env vars are set:
 *   1. --dry-run
 *   2. the real run
 *   3. --rollback only if the feed looks wrong
 */
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";
import { migrateLookPhotos } from "../src/lib/looks/migrate-photos.server.ts";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const rollback = args.has("--rollback");
const backupFlag = process.argv.find((arg) => arg.startsWith("--backup="));
const backupPath = backupFlag ? backupFlag.slice("--backup=".length) : undefined;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[photos] Set DATABASE_URL. This script does not migrate a throwaway in-memory database.");
  process.exit(1);
}

const pool = openDedicatedPool(databaseUrl);
const sql = async (strings, ...values) => {
  let text = strings[0] ?? "";
  for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
  const result = await pool.query(text, values);
  return result.rows;
};
sql.query = async (text, params = []) => (await pool.query(text, params)).rows;

try {
  const result = await migrateLookPhotos(sql, { dryRun, rollback, backupPath });
  console.log(
    `[photos] ${rollback ? "rollback" : "migrate"}${dryRun ? " dry-run" : ""}: uploaded ${result.uploaded}, skipped ${result.skipped}, restored ${result.restored}, deleted objects ${result.deletedObjects}`,
  );
} finally {
  await pool.end();
}
