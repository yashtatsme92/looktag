import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { localStorage } from "../providers/storage/local.ts";
import { openMemoryPglite } from "../providers/db/pglite.ts";
import type { Sql } from "../providers/db/types.ts";
import { backfillCroppedLookPhotos, parsePhotoBackfillCli } from "./backfill-cropped-photos.server.ts";

async function fixtureSql() {
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
  sql.query = async () => [];
  return sql;
}

describe("backfillCroppedLookPhotos", () => {
  it("does not fetch private-network image URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-crop-backfill-private-"));
    const sql = await fixtureSql();
    const store = localStorage(path.join(root, "storage"));
    let fetched = false;
    try {
      await sql`
        insert into looks (id, title, image_src, published)
        values (${"private-source"}, ${"Private source"}, ${"https://127.0.0.1/photo.jpg"}, ${true})
      `;
      const result = await backfillCroppedLookPhotos(sql, {
        dryRun: true,
        publicDir: path.join(root, "public"),
        store,
        fetcher: async () => {
          fetched = true;
          return new Response();
        },
      });
      assert.equal(fetched, false);
      assert.equal(result.plan[0]?.action, "unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("defaults to dry-run and makes backup confirmation precede every write", async () => {
    assert.deepEqual(parsePhotoBackfillCli([]), {
      dryRun: true,
      rollback: false,
      backupConfirmed: false,
      backupPath: undefined,
    });
    assert.equal(parsePhotoBackfillCli(["--apply", "--dry-run"]).dryRun, true);
    assert.equal(parsePhotoBackfillCli(["--rollback"]).rollback, true);
    assert.equal(parsePhotoBackfillCli(["--apply", "--backup-confirmed"]).backupConfirmed, true);

    const root = await mkdtemp(path.join(tmpdir(), "looktag-crop-backfill-"));
    const publicDir = path.join(root, "public");
    const backupPath = path.join(root, "backup.json");
    const sql = await fixtureSql();
    const store = localStorage(path.join(root, "storage"));
    const crop = { x: 0, y: 1 / 18, w: 1, h: 8 / 9 };
    const tags = [{ id: "pin", x: 52.3, y: 91.2, name: "Shoes" }];
    const bytes = await sharp({
      create: { width: 1152, height: 1728, channels: 3, background: { r: 80, g: 100, b: 140 } },
    })
      .jpeg()
      .toBuffer();
    try {
      await mkdir(path.join(publicDir, "looks"), { recursive: true });
      await writeFile(path.join(publicDir, "looks", "seed-fixture.jpg"), bytes);
      await sql`
        insert into looks (id, title, image_src, crop_json, tags_json, published)
        values (${"seed-fixture"}, ${"Fixture"}, ${"/looks/seed-fixture.jpg"}, ${JSON.stringify(crop)}, ${JSON.stringify(tags)}, ${true})
      `;

      const dry = await backfillCroppedLookPhotos(sql, { dryRun: true, publicDir, backupPath, store, avif: false });
      assert.equal(dry.plan[0]?.action, "bake");
      assert.deepEqual(dry.plan[0]?.sourceDimensions, { width: 1152, height: 1728 });
      assert.deepEqual(dry.plan[0]?.variants, {
        thumb: { width: 150, height: 200 },
        card: { width: 600, height: 800 },
        detail: { width: 1080, height: 1440 },
      });
      assert.equal(dry.plan[0]?.originalPresent, false);
      await assert.rejects(readFile(backupPath));
      await assert.rejects(readdir(path.join(root, "storage")));

      const firstApply = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        backupConfirmed: true,
        publicDir,
        backupPath,
        store,
        avif: false,
      });
      assert.equal(firstApply.backupCreated, true);
      assert.equal(firstApply.needsBackupCopy, true);
      assert.equal(firstApply.baked, 0);
      await assert.rejects(readdir(path.join(root, "storage")));

      const backup = JSON.parse(await readFile(backupPath, "utf8")) as {
        looks: Record<string, { cropJson: string; tagsJson: string }>;
      };
      assert.equal(backup.looks["seed-fixture"]?.cropJson, JSON.stringify(crop));
      assert.equal(backup.looks["seed-fixture"]?.tagsJson, JSON.stringify(tags));

      const applied = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        backupConfirmed: true,
        publicDir,
        backupPath,
        store,
        avif: false,
      });
      assert.equal(applied.baked, 1);
      const updated = await sql<{ image_src: string; image_variants_json: string; crop_json: string; tags_json: string }>`
        select image_src, image_variants_json, crop_json, tags_json from looks where id = ${"seed-fixture"}
      `;
      assert.notEqual(updated[0]?.image_src, "/looks/seed-fixture.jpg");
      assert.equal(updated[0]?.crop_json, JSON.stringify(crop));
      assert.equal(updated[0]?.tags_json, JSON.stringify(tags));
      const manifest = JSON.parse(updated[0]?.image_variants_json ?? "{}") as {
        original: { key: string };
        files: { w: number; h: number }[];
      };
      assert.ok(manifest.original);
      assert.ok(manifest.files.every((file) => file.w * 4 === file.h * 3));
      assert.deepEqual(Buffer.from((await store.get(manifest.original.key))!.body), bytes);

      const secondApply = await backfillCroppedLookPhotos(sql, {
        dryRun: false,
        backupConfirmed: true,
        publicDir,
        backupPath,
        store,
        avif: false,
      });
      assert.equal(secondApply.baked, 0);
      assert.equal(secondApply.plan[0]?.action, "skip");

      const preview = await backfillCroppedLookPhotos(sql, { dryRun: true, rollback: true, backupPath, store });
      assert.equal(preview.restored, 1);
      const rolledBack = await backfillCroppedLookPhotos(sql, { dryRun: false, rollback: true, backupPath, store });
      assert.equal(rolledBack.restored, 1);
      const restored = await sql<{ image_src: string; image_variants_json: string | null; crop_json: string; tags_json: string }>`
        select image_src, image_variants_json, crop_json, tags_json from looks where id = ${"seed-fixture"}
      `;
      assert.equal(restored[0]?.image_src, "/looks/seed-fixture.jpg");
      assert.equal(restored[0]?.image_variants_json, null);
      assert.equal(restored[0]?.crop_json, JSON.stringify(crop));
      assert.equal(restored[0]?.tags_json, JSON.stringify(tags));
      assert.ok(await store.get(manifest.original.key));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
