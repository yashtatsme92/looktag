#!/usr/bin/env node
/**
 * Bake the stored 3:4 crop into look-photo variants while preserving originals.
 *
 *   node --experimental-strip-types scripts/backfill-look-photos.mjs
 *   node --experimental-strip-types scripts/backfill-look-photos.mjs --apply
 *   node --experimental-strip-types scripts/backfill-look-photos.mjs --apply --backup-confirmed
 *   node --experimental-strip-types scripts/backfill-look-photos.mjs --rollback
 *   node --experimental-strip-types scripts/backfill-look-photos.mjs --rollback --apply
 *
 * A bare run is a read-only dry-run. The first --apply writes a mode-0600
 * database backup and stops. Copy that backup off this machine, then repeat
 * with --apply --backup-confirmed. `--dry-run` always overrides `--apply`.
 * Rollback restores image_src, image_variants_json, crop_json and tags_json;
 * it does not delete any R2 objects. This CLI uses Neon HTTP queries and does
 * not require a TCP connection to port 5432.
 *
 * Do not run against production without the owner's separate approval.
 */
import { neon } from "@neondatabase/serverless";
import { backfillCroppedLookPhotos, parsePhotoBackfillCli } from "../src/lib/looks/backfill-cropped-photos.server.ts";

const cli = parsePhotoBackfillCli(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[photos-3:4] Set DATABASE_URL. No database or storage changes were made.");
  process.exit(1);
}

if (process.argv.includes("--apply") && process.argv.includes("--dry-run")) {
  console.log("[photos-3:4] --dry-run overrides --apply; nothing will be written.");
}

const sql = neon(databaseUrl);
try {
  const result = await backfillCroppedLookPhotos(sql, {
    dryRun: cli.dryRun,
    rollback: cli.rollback,
    backupConfirmed: cli.backupConfirmed,
    backupPath: cli.backupPath,
  });
  if (!cli.rollback) {
    for (const item of result.plan) {
      console.log(
        `[photos-3:4] ${JSON.stringify({
          id: item.id,
          title: item.title,
          source: item.source,
          sourceDimensions: item.sourceDimensions,
          crop: item.crop,
          plannedVariants: item.variants,
          originalPresent: item.originalPresent,
          action: item.action,
          warning: item.warning,
        })}`,
      );
    }
  }
  if (result.needsBackupCopy) {
    console.error(`[photos-3:4] Backup written to ${result.backupPath}. Copy it off this machine before rerunning with --apply --backup-confirmed.`);
  }
  console.log(
    `[photos-3:4] ${cli.rollback ? "rollback" : "backfill"}${cli.dryRun ? " dry-run" : ""}: baked ${result.baked}, skipped ${result.skipped}, restored ${result.restored}`,
  );
} catch (error) {
  console.error("[photos-3:4] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
