import { mkdir, readFile, writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { dirname, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import type { Sql } from "../providers/db/types.ts";
import type { ObjectStorage } from "../providers/storage/types.ts";
import { storage } from "../providers/storage/index.ts";
import { centeredCrop, type CropRect } from "./crop.ts";
import { decodeDataImage, storeLookPhoto } from "./photo-store.server.ts";
import { parseStoredLookImages } from "./image-variants.ts";
import { encodeLookVariants } from "./image-encode.server.ts";

type LookPhotoRow = {
  id: string;
  title: string;
  image_src: string;
  image_variants_json: string | null;
  crop_json: string | null;
  tags_json: string | null;
  published: boolean;
};

type PhotoBackup = {
  version: 1;
  looks: Record<
    string,
    {
      imageSrc: string;
      imageVariantsJson: string | null;
      cropJson: string | null;
      tagsJson: string | null;
    }
  >;
};

export type PhotoBackfillPlan = {
  id: string;
  title: string;
  source: string;
  sourceDimensions: { width: number; height: number } | null;
  crop: CropRect | null;
  variants: Record<string, { width: number; height: number }>;
  originalPresent: boolean;
  action: "bake" | "skip" | "unavailable";
  warning?: string;
};

const DEFAULT_BACKUP = ".data/look-photo-backfill-backup.json";
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export function parsePhotoBackfillCli(argv: string[]) {
  const apply = argv.includes("--apply");
  return {
    dryRun: !apply || argv.includes("--dry-run"),
    rollback: argv.includes("--rollback"),
    backupConfirmed: argv.includes("--backup-confirmed"),
    backupPath: argv.find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length),
  };
}

export async function backfillCroppedLookPhotos(
  sql: Sql,
  options?: {
    dryRun?: boolean;
    rollback?: boolean;
    backupConfirmed?: boolean;
    backupPath?: string;
    publicDir?: string;
    store?: ObjectStorage;
    fetcher?: typeof fetch;
    avif?: boolean;
  },
) {
  const dryRun = Boolean(options?.dryRun);
  const rollback = Boolean(options?.rollback);
  const backupPath = resolve(options?.backupPath || DEFAULT_BACKUP);
  const store = options?.store ?? storage();
  const result = {
    dryRun,
    rollback,
    backupPath,
    backupCreated: false,
    needsBackupCopy: false,
    baked: 0,
    skipped: 0,
    restored: 0,
    plan: [] as PhotoBackfillPlan[],
  };

  if (rollback) return rollbackCroppedPhotos(sql, backupPath, dryRun, result);

  const rows = await sql<LookPhotoRow>`
    select id, title, image_src, image_variants_json, crop_json, tags_json, published
    from looks where published = true order by id
  `;
  const publicDir = resolve(options?.publicDir || "public");
  const preparedRows: Array<{ row: LookPhotoRow; source: Uint8Array; crop: CropRect }> = [];
  for (const row of rows) {
    const stored = parseStoredLookImages(row.image_variants_json);
    const crop = readCrop(row.crop_json);
    const originalObject = stored?.original ? await store.get(stored.original.key) : null;
    const originalPresent = Boolean(originalObject);
    const source = await chooseSource(row, stored, originalObject?.body, publicDir, store, options?.fetcher ?? fetch);
    if (!source) {
      result.plan.push({
        id: row.id,
        title: row.title,
        source: "unavailable",
        sourceDimensions: null,
        crop,
        variants: {},
        originalPresent,
        action: "unavailable",
        warning: "No readable original or variant source was found.",
      });
      continue;
    }
    const metadata = await sharp(source.bytes, { failOn: "none" }).metadata();
    const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
    const width = swapsDimensions ? (metadata.height ?? 0) : (metadata.width ?? 0);
    const height = swapsDimensions ? (metadata.width ?? 0) : (metadata.height ?? 0);
    if (width < 1 || height < 1) {
      result.plan.push({
        id: row.id,
        title: row.title,
        source: source.name,
        sourceDimensions: null,
        crop,
        variants: {},
        originalPresent,
        action: "unavailable",
        warning: "Source image dimensions could not be read.",
      });
      continue;
    }
    const effectiveCrop = crop ?? centeredCrop(width, height);
    const encoded = await encodeLookVariants(source.bytes, { crop: effectiveCrop, avif: options?.avif });
    const variants = Object.fromEntries(
      encoded.files
        .filter((file) => file.format === "webp")
        .map((file) => [file.size, { width: file.w, height: file.h }]),
    );
    const baked = isBakedManifest(stored);
    const warning = encoded.width < 1080 || encoded.height < 1440
      ? `Cropped source supports at most ${encoded.width}×${encoded.height}; variants will not be upscaled.`
      : undefined;
    result.plan.push({
      id: row.id,
      title: row.title,
      source: source.name,
      sourceDimensions: { width, height },
      crop: effectiveCrop,
      variants,
      originalPresent,
      action: originalPresent && baked ? "skip" : "bake",
      warning,
    });
    if (!dryRun && !(originalPresent && baked)) {
      preparedRows.push({ row, source: source.bytes, crop: effectiveCrop });
    }
  }

  return await applyPreparedBackfill(sql, rows, preparedRows, result, {
    dryRun,
    backupConfirmed: Boolean(options?.backupConfirmed),
    backupPath,
    store,
    avif: options?.avif,
  });
}

async function applyPreparedBackfill(
  sql: Sql,
  rows: LookPhotoRow[],
  preparedRows: Array<{ row: LookPhotoRow; source: Uint8Array; crop: CropRect }>,
  result: {
    dryRun: boolean;
    rollback: boolean;
    backupPath: string;
    backupCreated: boolean;
    needsBackupCopy: boolean;
    baked: number;
    skipped: number;
    restored: number;
    plan: PhotoBackfillPlan[];
  },
  options: { dryRun: boolean; backupConfirmed: boolean; backupPath: string; store: ObjectStorage; avif?: boolean },
) {
  result.skipped = result.plan.filter((item) => item.action !== "bake").length;
  if (options.dryRun || preparedRows.length === 0) return result;

  let backup: PhotoBackup | null = null;
  try {
    backup = JSON.parse(await readFile(options.backupPath, "utf8")) as PhotoBackup;
    if (backup.version !== 1 || !backup.looks) throw new Error("Invalid photo backup");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!backup) {
    backup = {
      version: 1,
      looks: Object.fromEntries(
        rows.map((row) => [
          row.id,
          {
            imageSrc: row.image_src,
            imageVariantsJson: row.image_variants_json,
            cropJson: row.crop_json,
            tagsJson: row.tags_json,
          },
        ]),
      ),
    };
    await mkdir(dirname(options.backupPath), { recursive: true });
    await writeFile(options.backupPath, JSON.stringify(backup, null, 2), { mode: 0o600 });
    result.backupCreated = true;
  }
  if (result.backupCreated || !options.backupConfirmed) {
    result.needsBackupCopy = true;
    return result;
  }

  for (const item of preparedRows) {
    const saved = await storeLookPhoto(item.row.id, item.source, options.store, {
      crop: item.crop,
      avif: options.avif,
    });
    await sql`
      update looks set image_src = ${saved.imageSrc}, image_variants_json = ${JSON.stringify(saved.stored)}
      where id = ${item.row.id}
    `;
    result.baked += 1;
  }
  return result;
}

async function rollbackCroppedPhotos(
  sql: Sql,
  backupPath: string,
  dryRun: boolean,
  result: {
    dryRun: boolean;
    rollback: boolean;
    backupPath: string;
    backupCreated: boolean;
    needsBackupCopy: boolean;
    baked: number;
    skipped: number;
    restored: number;
    plan: PhotoBackfillPlan[];
  },
) {
  let backup: PhotoBackup;
  try {
    backup = JSON.parse(await readFile(backupPath, "utf8")) as PhotoBackup;
  } catch {
    throw new Error(`Photo backfill backup not found: ${backupPath}`);
  }
  if (backup.version !== 1 || !backup.looks) throw new Error("Invalid photo backfill backup.");
  for (const [id, original] of Object.entries(backup.looks)) {
    if (!dryRun) {
      await sql`
        update looks
        set image_src = ${original.imageSrc},
            image_variants_json = ${original.imageVariantsJson},
            crop_json = ${original.cropJson},
            tags_json = ${original.tagsJson}
        where id = ${id}
      `;
    }
    result.restored += 1;
  }
  return result;
}

function readCrop(raw: string | null): CropRect | null {
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
      value.x! + value.w! <= 1 &&
      value.y! + value.h! <= 1
    ) {
      return { x: value.x!, y: value.y!, w: value.w!, h: value.h! };
    }
  } catch {
    return null;
  }
  return null;
}

function isBakedManifest(stored: ReturnType<typeof parseStoredLookImages>) {
  return Boolean(stored?.files.length && stored.files.every((file) => file.w * 4 === file.h * 3));
}

async function chooseSource(
  row: LookPhotoRow,
  stored: ReturnType<typeof parseStoredLookImages>,
  originalBytes: Uint8Array | undefined,
  publicDir: string,
  store: ObjectStorage,
  fetcher: typeof fetch,
): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (originalBytes) return { name: "stored original", bytes: originalBytes };
  if (row.id.startsWith("seed-")) {
    const seed = await localLookFile(row.image_src, publicDir, ".jpg", ".jpeg");
    if (seed) return { name: `local seed JPEG ${row.image_src}`, bytes: seed };
  }
  const fromSrc = await loadImageSrc(row.image_src, publicDir, fetcher);
  if (fromSrc) return { name: row.image_src, bytes: fromSrc };
  const files = [...(stored?.files ?? [])].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const file of files) {
    const object = await store.get(file.key);
    if (object?.body) return { name: `variant ${file.key}`, bytes: object.body };
  }
  return null;
}

async function loadImageSrc(src: string, publicDir: string, fetcher: typeof fetch): Promise<Uint8Array | null> {
  if (src.startsWith("data:")) {
    try {
      return decodeDataImage(src);
    } catch {
      return null;
    }
  }
  if (src.startsWith("/looks/")) return localLookFile(src, publicDir);
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  try {
    if (!(await isPublicRemoteHost(url.hostname))) return null;
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_SOURCE_BYTES) return null;
    return await readBoundedBody(response);
  } catch {
    return null;
  }
}

async function isPublicRemoteHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a! >= 224
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
    return (
      firstHextet >= 0x2000 &&
      firstHextet <= 0x3fff &&
      !normalized.includes("%") &&
      !normalized.startsWith("::ffff:") &&
      !normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

async function readBoundedBody(response: Response): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_SOURCE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function localLookFile(src: string, publicDir: string, ...extensions: string[]): Promise<Uint8Array | null> {
  if (!src.startsWith("/looks/") || src.includes("..") || src.includes("\0")) return null;
  const root = resolve(publicDir, "looks");
  const file = resolve(publicDir, src.slice(1));
  const path = relative(root, file);
  if (!path || path.startsWith(`..${sep}`) || path === ".." || (extensions.length && !extensions.includes(file.slice(file.lastIndexOf(".")).toLowerCase()))) {
    return null;
  }
  try {
    return new Uint8Array(await readFile(file));
  } catch {
    return null;
  }
}
