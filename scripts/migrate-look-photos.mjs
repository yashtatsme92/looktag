#!/usr/bin/env node
/**
 * Move look photos onto the storage provider (#219).
 *
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs --apply
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs --rollback
 *   node --experimental-strip-types scripts/migrate-look-photos.mjs --rollback --apply
 *
 * A bare run is a dry-run: it prints what it would upload and writes nothing
 * (no objects, no row updates, no backup file). Pass --apply to do it.
 * `--rollback` alone lists the looks it would restore and the object keys it
 * would delete. `--rollback --apply` restores those rows and deletes only the
 * keys the migration added. `--dry-run` is accepted and wins over `--apply`.
 *
 * Requires DATABASE_URL (the app's Postgres). Seed JPEGs are read from public/looks.
 * Data-URL uploads are decoded from looks.image_src. A backup of the previous
 * image_src values is written to .data/look-photo-migration-backup.json the
 * first time a row changes. Copy that file off the machine before you delete it.
 * Unpublished looks are skipped so they do not become public.
 *
 * Order on Render, after this release is deployed (so 0017_look_image_variants.sql
 * has run) and the storage env vars are set:
 *   1. bare command (dry-run)
 *   2. --apply
 *   3. --rollback --apply only if the feed looks wrong
 */
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";
import { migrateLookPhotos, parseMigrateCli } from "../src/lib/looks/migrate-photos.server.ts";

const cli = parseMigrateCli(process.argv.slice(2));

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[photos] Set DATABASE_URL. This script does not migrate a throwaway in-memory database.");
  process.exit(1);
}

if (process.argv.includes("--apply") && process.argv.includes("--dry-run")) {
  console.log("[photos] --dry-run overrides --apply; nothing will be written.");
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
  const result = await migrateLookPhotos(sql, {
    dryRun: cli.dryRun,
    rollback: cli.rollback,
    backupPath: cli.backupPath,
  });
  if (cli.dryRun) {
    for (const item of result.plan) {
      if (item.action === "upload") {
        console.log(`[photos] would upload ${item.id}`);
        continue;
      }
      const src = item.imageSrc?.startsWith("data:") ? "data-url" : item.imageSrc || "";
      const keys = item.keys?.length ? item.keys.join(" ") : "(none)";
      console.log(`[photos] would restore ${item.id} (${src}) delete ${keys}`);
    }
  }
  console.log(
    `[photos] ${cli.rollback ? "rollback" : "migrate"}${cli.dryRun ? " dry-run" : ""}: uploaded ${result.uploaded}, skipped ${result.skipped}, restored ${result.restored}, deleted objects ${result.deletedObjects}`,
  );
} finally {
  await pool.end();
}