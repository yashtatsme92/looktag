import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import type { Sql } from "../providers/db/types.ts";
import type { ObjectStorage } from "../providers/storage/types.ts";
import { storage } from "../providers/storage/index.ts";
import { decodeDataImage, deleteStoredLookImages, storeLookPhoto } from "./photo-store.server.ts";
import { contentHash } from "./image-keys.ts";
import { parseStoredLookImages } from "./image-variants.ts";
import { centeredCrop, type CropRect } from "./crop.ts";

export type PhotoMigrationBackup = {
  version: 1;
  looks: Record<string, { imageSrc: string; imageVariantsJson: string | null }>;
};

export type PhotoMigrationPlanItem = {
  id: string;
  action: "upload" | "restore";
  imageSrc?: string;
  keys?: string[];
};

export type PhotoMigrationResult = {
  dryRun: boolean;
  rollback: boolean;
  uploaded: number;
  skipped: number;
  restored: number;
  deletedObjects: number;
  plan: PhotoMigrationPlanItem[];
};

type LookPhotoRow = {
  id: string;
  image_src: string;
  image_variants_json: string | null;
  crop_json: string | null;
  published: boolean;
};

const DEFAULT_BACKUP = ".data/look-photo-migration-backup.json";

function emptyBackup(): PhotoMigrationBackup {
  return { version: 1, looks: {} };
}

async function readBackup(path: string): Promise<PhotoMigrationBackup> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as PhotoMigrationBackup;
    if (parsed?.version !== 1 || !parsed.looks) return emptyBackup();
    return parsed;
  } catch {
    return emptyBackup();
  }
}

async function writeBackup(path: string, backup: PhotoMigrationBackup): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(backup));
}

async function loadBytes(imageSrc: string, publicDir: string): Promise<Uint8Array | null> {
  if (imageSrc.startsWith("data:")) return decodeDataImage(imageSrc);
  if (imageSrc.startsWith("/looks/") && !imageSrc.includes("..") && !imageSrc.includes("\0")) {
    try {
      return new Uint8Array(await readFile(join(publicDir, imageSrc.slice(1))));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * CLI flags for `scripts/migrate-look-photos.mjs`.
 * A bare invocation is a dry-run. `--apply` writes. `--rollback` without
 * `--apply` only lists restores. `--dry-run` forces a dry-run even with `--apply`.
 */
export function parseMigrateCli(argv: string[]): { dryRun: boolean; rollback: boolean; backupPath?: string } {
  const apply = argv.includes("--apply");
  const forceDry = argv.includes("--dry-run");
  const backupFlag = argv.find((arg) => arg.startsWith("--backup="));
  return {
    dryRun: !apply || forceDry,
    rollback: argv.includes("--rollback"),
    backupPath: backupFlag ? backupFlag.slice("--backup=".length) : undefined,
  };
}

/**
 * Upload seed files and data-URL photos, then point `image_src` at the detail
 * JPEG. Idempotent: a look whose stored hash already matches the bytes is left
 * alone. Rollback restores the backup and deletes only object keys the
 * migration added. Unpublished looks are not uploaded, so they never get a public URL.
 * `dryRun` (the CLI default) uploads nothing, deletes nothing, and writes no backup.
 */
export async function migrateLookPhotos(
  sql: Sql,
  options?: {
    dryRun?: boolean;
    rollback?: boolean;
    backupPath?: string;
    publicDir?: string;
    store?: ObjectStorage;
    avif?: boolean;
  },
): Promise<PhotoMigrationResult> {
  const dryRun = Boolean(options?.dryRun);
  const rollback = Boolean(options?.rollback);
  const backupPath = resolve(options?.backupPath || DEFAULT_BACKUP);
  const publicDir = options?.publicDir || resolve("public");
  const store = options?.store ?? storage();
  const result: PhotoMigrationResult = {
    dryRun,
    rollback,
    uploaded: 0,
    skipped: 0,
    restored: 0,
    deletedObjects: 0,
    plan: [],
  };
  if (rollback) return rollbackPhotos(sql, store, backupPath, dryRun, result);

  const rows = await sql<LookPhotoRow>`
    select id, image_src, image_variants_json, crop_json, published from looks
  `;
  const backup = dryRun ? emptyBackup() : await readBackup(backupPath);
  let backupDirty = false;

  for (const row of rows) {
    if (!row.published) {
      result.skipped += 1;
      continue;
    }
    const bytes = await loadBytes(row.image_src, publicDir).catch(() => null);
    if (!bytes) {
      result.skipped += 1;
      continue;
    }
    const crop = await cropFor(bytes, row.crop_json);
    const hash = contentHash(bytes, crop);
    const existing = parseStoredLookImages(row.image_variants_json);
    if (existing?.hash === hash && existing.original) {
      result.skipped += 1;
      continue;
    }
    if (dryRun) {
      result.plan.push({ id: row.id, action: "upload" });
      result.uploaded += 1;
      continue;
    }
    if (!backup.looks[row.id]) {
      backup.looks[row.id] = { imageSrc: row.image_src, imageVariantsJson: row.image_variants_json };
      backupDirty = true;
    }
    const saved = await storeLookPhoto(row.id, bytes, store, { avif: options?.avif, crop });
    if (existing && existing.prefix !== saved.stored.prefix) await deleteStoredLookImages(existing, store);
    await sql`
      update looks
      set image_src = ${saved.imageSrc}, image_variants_json = ${JSON.stringify(saved.stored)}
      where id = ${row.id}
    `;
    result.uploaded += 1;
  }

  async function cropFor(bytes: Uint8Array, raw: string | null): Promise<CropRect> {
    const metadata = await sharp(bytes, { failOn: "none" }).metadata();
    const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
    const width = swapsDimensions ? (metadata.height ?? 0) : (metadata.width ?? 0);
    const height = swapsDimensions ? (metadata.width ?? 0) : (metadata.height ?? 0);
    if (width < 1 || height < 1) throw new Error("Source image dimensions could not be read.");
    if (raw) {
      try {
        const value = JSON.parse(raw) as Partial<CropRect>;
        if (
          Number.isFinite(value.x) &&
          Number.isFinite(value.y) &&
          Number.isFinite(value.w) &&
          Number.isFinite(value.h) &&
          value.x! >= 0 &&
          value.y! >= 0 &&
          value.w! > 0 &&
          value.h! > 0 &&
          value.x! + value.w! <= 1 &&
          value.y! + value.h! <= 1
        ) {
          return { x: value.x!, y: value.y!, w: value.w!, h: value.h! };
        }
      } catch {
        // Invalid legacy crop values use the same centered default as uploads.
      }
    }
    return centeredCrop(width, height);
  }

  if (backupDirty) await writeBackup(backupPath, backup);
  return result;
}

async function rollbackPhotos(
  sql: Sql,
  store: ObjectStorage,
  backupPath: string,
  dryRun: boolean,
  result: PhotoMigrationResult,
): Promise<PhotoMigrationResult> {
  const backup = await readBackup(backupPath);
  const ids = Object.keys(backup.looks);
  for (const id of ids) {
    const original = backup.looks[id];
    if (!original) continue;
    const rows = await sql<{ image_variants_json: string | null }>`
      select image_variants_json from looks where id = ${id} limit 1
    `;
    const current = parseStoredLookImages(rows[0]?.image_variants_json);
    const previous = parseStoredLookImages(original.imageVariantsJson);
    const keys = new Set<string>();
    for (const file of current?.files ?? []) keys.add(file.key);
    for (const file of previous?.files ?? []) keys.delete(file.key);
    if (dryRun) {
      result.plan.push({ id, action: "restore", imageSrc: original.imageSrc, keys: [...keys] });
      result.restored += 1;
      result.deletedObjects += keys.size;
      continue;
    }
    await sql`
      update looks
      set image_src = ${original.imageSrc}, image_variants_json = ${original.imageVariantsJson}
      where id = ${id}
    `;
    if (keys.size) {
      await deleteStoredLookImages(
        {
          hash: "",
          prefix: "",
          width: 0,
          height: 0,
          files: [...keys].map((key) => ({ key, size: "card" as const, format: "jpeg" as const, w: 0, h: 0 })),
        },
        store,
      );
    }
    result.restored += 1;
    result.deletedObjects += keys.size;
  }
  return result;
}
