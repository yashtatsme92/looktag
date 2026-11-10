import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Sql } from "../providers/db/types.ts";
import type { ObjectStorage } from "../providers/storage/types.ts";
import { storage } from "../providers/storage/index.ts";
import { decodeDataImage, deleteStoredLookImages, storeLookPhoto } from "./photo-store.server.ts";
import { contentHash } from "./image-keys.ts";
import { parseStoredLookImages } from "./image-variants.ts";

export type PhotoMigrationBackup = {
  version: 1;
  looks: Record<string, { imageSrc: string; imageVariantsJson: string | null }>;
};

export type PhotoMigrationResult = {
  dryRun: boolean;
  rollback: boolean;
  uploaded: number;
  skipped: number;
  restored: number;
  deletedObjects: number;
};

type LookPhotoRow = {
  id: string;
  image_src: string;
  image_variants_json: string | null;
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
 * Upload seed files and data-URL photos, then point `image_src` at the detail
 * JPEG. Idempotent: a look whose stored hash already matches the bytes is left
 * alone. `--rollback` restores the backup and deletes objects written for those looks.
 * Unpublished looks are not uploaded, so they never get a public URL.
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
  const result: PhotoMigrationResult = { dryRun, rollback, uploaded: 0, skipped: 0, restored: 0, deletedObjects: 0 };
  if (rollback) return rollbackPhotos(sql, store, backupPath, dryRun, result);

  const rows = await sql<LookPhotoRow>`
    select id, image_src, image_variants_json, published from looks
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
    const hash = contentHash(bytes);
    const existing = parseStoredLookImages(row.image_variants_json);
    if (existing?.hash === hash) {
      result.skipped += 1;
      continue;
    }
    if (dryRun) {
      result.uploaded += 1;
      continue;
    }
    if (!backup.looks[row.id]) {
      backup.looks[row.id] = { imageSrc: row.image_src, imageVariantsJson: row.image_variants_json };
      backupDirty = true;
    }
    const saved = await storeLookPhoto(row.id, bytes, store, { avif: options?.avif });
    if (existing && existing.prefix !== saved.stored.prefix) await deleteStoredLookImages(existing, store);
    await sql`
      update looks
      set image_src = ${saved.imageSrc}, image_variants_json = ${JSON.stringify(saved.stored)}
      where id = ${row.id}
    `;
    result.uploaded += 1;
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
