import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { localStorage } from "../providers/storage/local.ts";
import { openMemoryPglite } from "../providers/db/pglite.ts";
import type { Sql } from "../db.ts";
import { backfillCroppedLookPhotos, parsePhotoBackfillCli } from "./backfill-cropped-photos.server.ts";
import { contentHash } from "./image-keys.ts";
import { isThreeByFour } from "./photo-frame.ts";

async function memorySql(): Promise<Sql> {
  const pg = await openMemoryPglite();
  await pg.exec(`
    create table looks (
      id text primary key,
      title text not null,
      image_src text not null,
      image_variants_json text,
      crop_json text,
      tags_json text,
      published boolean not null default true
    )
  `);
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    const result = await pg.query<T>(text, values);
    return result.rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await pg.query<T>(text, params)).rows;
  return sql;
}

describe("backfillCroppedLookPhotos", () => {
  it("parses a bare run as dry-run and lets --dry-run win", () => {
    assert.equal(parsePhotoBackfillCli([]).dryRun, true);
    assert.equal(parsePhotoBackfillCli(["--apply"]).dryRun, false);
    assert.equal(parsePhotoBackfillCli(["--apply", "--dry-run"]).dryRun, true);
    assert.equal(parsePhotoBackfillCli(["--rollback", "--apply"]).rollback, true);
    assert.equal(parsePhotoBackfillCli(["--apply", "--backup-confirmed"]).backupConfirmed, true);
  });

  it("dry-run prints a plan, apply backs up first, then bakes without touching crop, pins, or old objects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-3x4-"));
    const publicDir = path.join(root, "public");
    const backupPath = path.join(root, "backup.json");
    await mkdir(path.join(publicDir, "looks"), { recursive: true });
    const jpeg = await sharp({
      create: { width: 120, height: 180, channels: 3, background: { r: 12, g: 40, b: 80 } },
    })
      .jpeg()
      .toBuffer();
    await writeFile(path.join(publicDir, "looks", "tiny.jpg"), jpeg);
    const crop = { x: 0, y: 0.05, w: 1, h: 0.9 };
    const tags = JSON.stringify([{ id: "pin", x: 40, y: 30, name: "Coat" }]);
    const oldKey = "looks/old/detail.jpg";
    const store = localStorage(path.join(root, "storage"));
    await store.put(oldKey, new Uint8Array([9, 9, 9]), "image/jpeg");
    const previous = {
      hash: "old",
      prefix: "looks/old",
      width: 80,
      height: 120,
      files: [{ key: oldKey, size: "detail", format: "jpeg", w: 80, h: 120 }],
    };
    const sql = await memorySql();
    await sql`
      insert into looks (id, title, image_src, image_variants_json, crop_json, tags_json, published)
      values (${"look-1"}, ${"Tiny coat"}, ${"/looks/tiny.jpg"}, ${JSON.stringify(previous)}, ${JSON.stringify(crop)}, ${tags}, ${true})
    `;
    try {
      const dry = await backfillCroppedLookPhotos(sql, {
        dryRun: true,
        backupPath,
        publicDir,
        store,
        avif: false,
      });
      assert.equal(dry.dryRun, true);
      assert.equal(dry.baked, 1);
      assert.equal(dry.needsBackupCopy, false);
      assert.equal(dry.plan[0]?.source, "file:/looks/tiny.jpg");
      assert.deepEqual(dry.plan[0]?.sourceDimensions, { w: 120, h: 180 });
      assert.equal(dry.plan[0]?.variants.thumb, "120x160");
      await assert.rejects(readFile(backupPath));
      const untouched = await sql<{ image_src: string }>`select image_src from looks where id = ${"look-1"}`;
      assert.equal(untouched[0]?.image_src, "/looks/tiny.jpg");

      const gated = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        backupConfirmed: false,
        backupPath,
        publicDir,
        store,
        avif: false,
      });
      assert.equal(gated.needsBackupCopy, true);
      assert.equal(gated.baked, 1);
      const mode = await stat(backupPath);
      assert.equal(mode.mode & 0o777, 0o600);
      const still = await sql<{ image_src: string; crop_json: string }>`select image_src, crop_json from looks where id = ${"look-1"}`;
      assert.equal(still[0]?.image_src, "/looks/tiny.jpg");
      assert.deepEqual(JSON.parse(still[0]?.crop_json ?? "null"), crop);

      const applied = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        backupConfirmed: true,
        backupPath,
        publicDir,
        store,
        avif: false,
      });
      assert.equal(applied.baked, 1);
      assert.equal(applied.skipped, 0);
      const row = await sql<{ image_src: string; image_variants_json: string; crop_json: string; tags_json: string }>`
        select image_src, image_variants_json, crop_json, tags_json from looks where id = ${"look-1"}
      `;
      assert.notEqual(row[0]?.image_src, "/looks/tiny.jpg");
      assert.equal(row[0]?.tags_json, tags);
      assert.deepEqual(JSON.parse(row[0]?.crop_json ?? "null"), crop);
      const stored = JSON.parse(row[0]?.image_variants_json ?? "{}") as {
        hash: string;
        width: number;
        height: number;
        original?: { key: string };
        crop?: typeof crop;
        files: { w: number; h: number; size: string }[];
      };
      assert.equal(stored.hash, contentHash(new Uint8Array(jpeg)));
      assert.equal(isThreeByFour(stored.width, stored.height), true);
      assert.deepEqual(stored.crop, crop);
      assert.ok(stored.original?.key);
      const original = await store.get(stored.original!.key);
      assert.deepEqual(Buffer.from(original?.body ?? []), Buffer.from(jpeg));
      assert.ok(await store.get(oldKey), "old object is kept");
      const detail = stored.files.find((file) => file.size === "detail");
      assert.equal(detail && isThreeByFour(detail.w, detail.h), true);

      const again = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        backupConfirmed: true,
        backupPath,
        publicDir,
        store,
        avif: false,
      });
      assert.equal(again.baked, 0);
      assert.equal(again.skipped, 1);
      assert.equal(again.plan[0]?.action, "skip");

      const rolled = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        rollback: true,
        backupConfirmed: true,
        backupPath,
        store,
      });
      assert.equal(rolled.restored, 1);
      const restored = await sql<{ image_src: string; crop_json: string; tags_json: string }>`
        select image_src, crop_json, tags_json from looks where id = ${"look-1"}
      `;
      assert.equal(restored[0]?.image_src, "/looks/tiny.jpg");
      assert.deepEqual(JSON.parse(restored[0]?.crop_json ?? "null"), crop);
      assert.equal(restored[0]?.tags_json, tags);
      assert.ok(await store.get(oldKey));
      assert.ok(await store.get(stored.original!.key));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
