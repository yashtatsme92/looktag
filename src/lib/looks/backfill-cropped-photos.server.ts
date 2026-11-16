import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import type { Sql } from "../providers/db/types.ts";
import type { ObjectStorage } from "../providers/storage/types.ts";
import { storage } from "../providers/storage/index.ts";
import { centeredCrop, type CropRect } from "./crop.ts";
import { decodeDataImage, storeLookPhoto } from "./photo-store.server.ts";
import { contentHash } from "./image-keys.ts";
import { LOOK_IMAGE_BOXES, parseStoredLookImages, type LookImageSize, type StoredLookImages } from "./image-variants.ts";
import { isThreeByFour } from "./photo-frame.ts";
import { SEED_LOOKS } from "./seed.ts";

export type PhotoBackfillPlanItem = {
  id: string;
  title: string;
  source: string;
  sourceDimensions: { w: number; h: number } | null;
  crop: CropRect | null;
  variants: Record<LookImageSize, string>;
  originalPresent: boolean;
  action: "bake" | "skip" | "restore";
  warning?: string;
};

export type PhotoBackfillResult = {
  dryRun: boolean;
  rollback: boolean;
  baked: number;
  skipped: number;
  restored: number;
  needsBackupCopy: boolean;
  backupPath: string;
  plan: PhotoBackfillPlanItem[];
};

type LookRow = {
  id: string;
  title: string;
  image_src: string;
  image_variants_json: string | null;
  crop_json: string | null;
  tags_json: string | null;
};

type BackupLook = {
  imageSrc: string;
  imageVariantsJson: string | null;
  cropJson: string | null;
  tagsJson: string | null;
};

type BackupFile = { version: 1; looks: Record<string, BackupLook> };

const DEFAULT_BACKUP = ".data/look-photo-3x4-backup.json";

export function parsePhotoBackfillCli(argv: string[]): {
  dryRun: boolean;
  rollback: boolean;
  backupConfirmed: boolean;
  backupPath?: string;
} {
  const apply = argv.includes("--apply");
  const backupFlag = argv.find((arg) => arg.startsWith("--backup="));
  return {
    dryRun: argv.includes("--dry-run") || !apply,
    rollback: argv.includes("--rollback"),
    backupConfirmed: argv.includes("--backup-confirmed"),
    backupPath: backupFlag ? backupFlag.slice("--backup=".length) : undefined,
  };
}

function parseCrop(raw: string | null): CropRect | null {
  if (!raw) return null;
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
      value.x! + value.w! <= 1.001 &&
      value.y! + value.h! <= 1.001
    ) {
      return { x: value.x!, y: value.y!, w: value.w!, h: value.h! };
    }
  } catch {
    return null;
  }
  return null;
}

function cropsMatch(a: CropRect | undefined, b: CropRect | null): boolean {
  if (!a || !b) return !a && !b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

async function dimensions(bytes: Uint8Array): Promise<{ w: number; h: number } | null> {
  try {
    const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
    if (!meta.width || !meta.height) return null;
    return { w: meta.width, h: meta.height };
  } catch {
    return null;
  }
}

function plannedVariants(source: { w: number; h: number } | null, crop: CropRect | null): {
  variants: Record<LookImageSize, string>;
  warning?: string;
} {
  if (!source) {
    return {
      variants: { thumb: "unknown", card: "unknown", detail: "unknown" },
      warning: "Source dimensions could not be read.",
    };
  }
  const rect = crop ?? centeredCrop(source.w, source.h);
  const left = Math.min(source.w - 1, Math.max(0, Math.round(rect.x * source.w)));
  const top = Math.min(source.h - 1, Math.max(0, Math.round(rect.y * source.h)));
  const cropW = Math.min(source.w - left, Math.max(1, Math.round(rect.w * source.w)));
  const cropH = Math.min(source.h - top, Math.max(1, Math.round(rect.h * source.h)));
  const unit = Math.floor(Math.min(cropW / 3, cropH / 4));
  const variants = {} as Record<LookImageSize, string>;
  let warning: string | undefined;
  for (const size of ["thumb", "card", "detail"] as const) {
    const box = LOOK_IMAGE_BOXES[size];
    const fit = Math.floor(Math.min(unit, box.w / 3, box.h / 4));
    if (fit < box.w / 3) warning = `Cropped source is smaller than ${size}; not upscaling.`;
    variants[size] = fit >= 1 ? `${fit * 3}x${fit * 4}` : "too-small";
  }
  return { variants, warning };
}

async function readLocal(publicDir: string, src: string): Promise<Uint8Array | null> {
  if (!src.startsWith("/looks/") || src.includes("..")) return null;
  try {
    return new Uint8Array(await readFile(join(publicDir, src.slice(1))));
  } catch {
    return null;
  }
}

/**
 * Bake stored 3:4 crops into variants and keep the original bytes.
 * Dry-run by default. Never rewrites crop_json or pin coordinates.
 * Previous storage objects are left in place.
 */
export async function backfillCroppedLookPhotos(
  sql: Sql,
  options?: {
    dryRun?: boolean;
    rollback?: boolean;
    backupConfirmed?: boolean;
    backupPath?: string;
    publicDir?: string;
    store?: ObjectStorage;
    avif?: boolean;
    fetchUrl?: (url: string) => Promise<Uint8Array | null>;
  },
): Promise<PhotoBackfillResult> {
  const dryRun = options?.dryRun !== false;
  const rollback = Boolean(options?.rollback);
  const backupPath = resolve(options?.backupPath || DEFAULT_BACKUP);
  const publicDir = options?.publicDir || resolve("public");
  const store = options?.store ?? storage();
  const result: PhotoBackfillResult = {
    dryRun,
    rollback,
    baked: 0,
    skipped: 0,
    restored: 0,
    needsBackupCopy: false,
    backupPath,
    plan: [],
  };
  if (rollback) return rollbackPhotos(sql, backupPath, dryRun, result);

  const rows = await sql<LookRow>`
    select id, title, image_src, image_variants_json, crop_json, tags_json from looks
  `;
  const gate = !dryRun && !options?.backupConfirmed;
  if (gate) {
    await writeBackup(backupPath, await collectBackup(sql, rows));
    result.needsBackupCopy = true;
  }

  for (const row of rows) {
    const stored = parseStoredLookImages(row.image_variants_json);
    const crop = parseCrop(row.crop_json);
    const chosen = await chooseSource(row, stored, publicDir, store, options?.fetchUrl);
    const size = chosen ? await dimensions(chosen.bytes) : null;
    const planned = plannedVariants(size, crop);
    const originalPresent = Boolean(stored?.original);
    if (chosen && stored?.original && stored.hash === contentHash(chosen.bytes) && isThreeByFour(stored.width, stored.height) && cropsMatch(stored.crop, crop ?? stored.crop ?? null)) {
      result.plan.push({
        id: row.id,
        title: row.title,
        source: chosen.label,
        sourceDimensions: size,
        crop,
        variants: planned.variants,
        originalPresent: true,
        action: "skip",
      });
      result.skipped += 1;
      continue;
    }
    if (!chosen || !size) {
      result.plan.push({
        id: row.id,
        title: row.title,
        source: chosen?.label ?? "none",
        sourceDimensions: size,
        crop,
        variants: planned.variants,
        originalPresent,
        action: "skip",
        warning: planned.warning ?? "No original pixels found. Nothing was invented.",
      });
      result.skipped += 1;
      continue;
    }
    const useCrop = crop ?? centeredCrop(size.w, size.h);
    result.plan.push({
      id: row.id,
      title: row.title,
      source: chosen.label,
      sourceDimensions: size,
      crop: useCrop,
      variants: planned.variants,
      originalPresent,
      action: dryRun ? "bake" : "bake",
      warning: crop ? planned.warning : planned.warning ?? "No crop_json; encoding a centered 3:4 without writing one.",
    });
    if (dryRun || gate) {
      result.baked += 1;
      continue;
    }
    const saved = await storeLookPhoto(row.id, chosen.bytes, store, { avif: options?.avif, crop: useCrop });
    await sql`
      update looks
      set image_src = ${saved.imageSrc}, image_variants_json = ${JSON.stringify(saved.stored)}
      where id = ${row.id}
    `;
    result.baked += 1;
  }
  return result;
}

async function chooseSource(
  row: LookRow,
  stored: StoredLookImages | null,
  publicDir: string,
  store: ObjectStorage,
  fetchUrl?: (url: string) => Promise<Uint8Array | null>,
): Promise<{ bytes: Uint8Array; label: string } | null> {
  if (stored?.original?.key) {
    const object = await store.get(stored.original.key);
    if (object?.body?.byteLength) return { bytes: object.body, label: `original:${stored.original.key}` };
  }
  const seed = SEED_LOOKS.find((look) => look.id === row.id);
  if (seed?.imageSrc) {
    const file = await readLocal(publicDir, seed.imageSrc);
    if (file) return { bytes: file, label: `seed:${seed.imageSrc}` };
  }
  if (row.image_src.startsWith("/looks/")) {
    const file = await readLocal(publicDir, row.image_src);
    if (file) return { bytes: file, label: `file:${row.image_src}` };
  }
  if (row.image_src.startsWith("data:")) {
    try {
      return { bytes: decodeDataImage(row.image_src), label: "data-url" };
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(row.image_src)) {
    const bytes = fetchUrl ? await fetchUrl(row.image_src) : await fetch(row.image_src).then(async (res) => (res.ok ? new Uint8Array(await res.arrayBuffer()) : null)).catch(() => null);
    if (bytes?.byteLength) return { bytes, label: `url:${row.image_src}` };
  }
  const largest = [...(stored?.files ?? [])].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (largest) {
    const object = await store.get(largest.key);
    if (object?.body?.byteLength) return { bytes: object.body, label: `variant:${largest.key}` };
  }
  return null;
}

async function collectBackup(sql: Sql, rows: LookRow[]): Promise<BackupFile> {
  const looks: BackupFile["looks"] = {};
  for (const row of rows) {
    const fresh = await sql<LookRow>`
      select id, title, image_src, image_variants_json, crop_json, tags_json from looks where id = ${row.id} limit 1
    `;
    const current = fresh[0] ?? row;
    looks[row.id] = {
      imageSrc: current.image_src,
      imageVariantsJson: current.image_variants_json,
      cropJson: current.crop_json,
      tagsJson: current.tags_json,
    };
  }
  return { version: 1, looks };
}

async function writeBackup(path: string, backup: BackupFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(backup));
  await chmod(path, 0o600);
}

async function readBackup(path: string): Promise<BackupFile | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as BackupFile;
    if (parsed?.version !== 1 || !parsed.looks) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function rollbackPhotos(sql: Sql, backupPath: string, dryRun: boolean, result: PhotoBackfillResult): Promise<PhotoBackfillResult> {
  const backup = await readBackup(backupPath);
  if (!backup) return result;
  for (const [id, look] of Object.entries(backup.looks)) {
    result.plan.push({
      id,
      title: id,
      source: look.imageSrc,
      sourceDimensions: null,
      crop: parseCrop(look.cropJson),
      variants: { thumb: "restore", card: "restore", detail: "restore" },
      originalPresent: false,
      action: "restore",
    });
    if (!dryRun) {
      await sql`
        update looks
        set image_src = ${look.imageSrc},
            image_variants_json = ${look.imageVariantsJson},
            crop_json = ${look.cropJson},
            tags_json = ${look.tagsJson}
        where id = ${id}
      `;
    }
    result.restored += 1;
  }
  return result;
}
