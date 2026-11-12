import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { localStorage } from "../providers/storage/local.ts";
import { openMemoryPglite } from "../providers/db/pglite.ts";
import { migrateLookPhotos, parseMigrateCli } from "./migrate-photos.server.ts";
import type { Sql } from "../db.ts";

async function memorySql(): Promise<Sql> {
  const pg = await openMemoryPglite();
  await pg.exec(`
    create table looks (
      id text primary key,
      image_src text not null,
      image_variants_json text,
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

describe("migrateLookPhotos", () => {
  it("parses a bare run as dry-run and requires --apply to write", () => {
    assert.deepEqual(parseMigrateCli([]), { dryRun: true, rollback: false, backupPath: undefined });
    assert.equal(parseMigrateCli(["--apply"]).dryRun, false);
    assert.equal(parseMigrateCli(["--apply"]).rollback, false);
    assert.equal(parseMigrateCli(["--dry-run", "--apply"]).dryRun, true);
    const bareRollback = parseMigrateCli(["--rollback"]);
    assert.equal(bareRollback.dryRun, true);
    assert.equal(bareRollback.rollback, true);
    const applyRollback = parseMigrateCli(["--rollback", "--apply"]);
    assert.equal(applyRollback.dryRun, false);
    assert.equal(applyRollback.rollback, true);
    assert.equal(parseMigrateCli(["--backup=/tmp/photos.json"]).backupPath, "/tmp/photos.json");
  });

  it("bare run writes nothing, --apply writes, and a second --apply is idempotent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-photos-"));
    const publicDir = path.join(root, "public");
    const backupPath = path.join(root, "backup.json");
    await mkdir(path.join(publicDir, "looks"), { recursive: true });
    const jpeg = await sharp({
      create: { width: 40, height: 50, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    await writeFile(path.join(publicDir, "looks", "tiny.jpg"), jpeg);
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const store = localStorage(path.join(root, "storage"));
    const previousBase = process.env.STORAGE_PUBLIC_BASE_URL;
    process.env.STORAGE_PUBLIC_BASE_URL = "https://img.example.test";
    try {
      const sql = await memorySql();
      await sql`insert into looks (id, image_src, published) values (${"seed"}, ${"/looks/tiny.jpg"}, ${true})`;
      await sql`insert into looks (id, image_src, published) values (${"upload"}, ${dataUrl}, ${true})`;
      await sql`insert into looks (id, image_src, published) values (${"draft"}, ${dataUrl}, ${false})`;

      const dry = await migrateLookPhotos(sql, { ...parseMigrateCli([]), publicDir, backupPath, store, avif: false });
      assert.equal(dry.dryRun, true);
      assert.equal(dry.uploaded, 2);
      assert.equal(dry.skipped, 1);
      assert.deepEqual(
        dry.plan.map((item) => item.id).sort(),
        ["seed", "upload"],
      );
      assert.equal(dry.plan.every((item) => item.action === "upload"), true);
      const still = await sql<{ image_src: string }>`select image_src from looks where id = ${"seed"}`;
      assert.equal(still[0]?.image_src, "/looks/tiny.jpg");
      await assert.rejects(readFile(backupPath));
      await assert.rejects(readdir(path.join(root, "storage")));

      const first = await migrateLookPhotos(sql, {
        ...parseMigrateCli(["--apply"]),
        publicDir,
        backupPath,
        store,
        avif: false,
      });
      assert.equal(first.dryRun, false);
      assert.equal(first.uploaded, 2);
      const seeded = await sql<{ image_src: string; image_variants_json: string }>`
        select image_src, image_variants_json from looks where id = ${"seed"}
      `;
      assert.match(seeded[0]?.image_src ?? "", /^https:\/\/img\.example\.test\/looks\/.+\.jpg$/);
      assert.equal(seeded[0]?.image_src.includes("seed"), false);
      const stored = JSON.parse(seeded[0]?.image_variants_json ?? "{}") as { files: { key: string }[] };
      assert.ok(stored.files.length >= 6);
      for (const file of stored.files) {
        const object = await store.get(file.key);
        assert.ok(object?.body.byteLength, file.key);
        assert.match(object?.cacheControl ?? "", /immutable/);
      }
      const draft = await sql<{ image_src: string }>`select image_src from looks where id = ${"draft"}`;
      assert.equal(draft[0]?.image_src, dataUrl);

      const second = await migrateLookPhotos(sql, {
        ...parseMigrateCli(["--apply"]),
        publicDir,
        backupPath,
        store,
        avif: false,
      });
      assert.equal(second.uploaded, 0);
      assert.ok(second.skipped >= 2);

      const backup = JSON.parse(await readFile(backupPath, "utf8")) as { looks: { seed: { imageSrc: string } } };
      assert.equal(backup.looks.seed.imageSrc, "/looks/tiny.jpg");

      const preview = await migrateLookPhotos(sql, { ...parseMigrateCli(["--rollback"]), backupPath, store });
      assert.equal(preview.dryRun, true);
      assert.equal(preview.restored, 2);
      assert.ok((preview.plan.find((item) => item.id === "seed")?.keys?.length ?? 0) >= 6);
      const duringPreview = await sql<{ image_src: string }>`select image_src from looks where id = ${"seed"}`;
      assert.equal(duringPreview[0]?.image_src, seeded[0]?.image_src);
      for (const file of stored.files) assert.ok(await store.get(file.key));

      const rolled = await migrateLookPhotos(sql, { ...parseMigrateCli(["--rollback", "--apply"]), backupPath, store });
      assert.equal(rolled.dryRun, false);
      assert.equal(rolled.restored, 2);
      const restored = await sql<{ image_src: string; image_variants_json: string | null }>`
        select image_src, image_variants_json from looks where id = ${"seed"}
      `;
      assert.equal(restored[0]?.image_src, "/looks/tiny.jpg");
      assert.equal(restored[0]?.image_variants_json, null);
      for (const file of stored.files) assert.equal(await store.get(file.key), null);
    } finally {
      if (previousBase === undefined) delete process.env.STORAGE_PUBLIC_BASE_URL;
      else process.env.STORAGE_PUBLIC_BASE_URL = previousBase;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rollback --apply deletes only keys the migration added", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "looktag-photos-rollback-"));
    const backupPath = path.join(root, "backup.json");
    const store = localStorage(path.join(root, "storage"));
    const keep = "looks/keep/previous.jpg";
    const added = "looks/new/detail.jpg";
    const previous = {
      hash: "old",
      prefix: "looks/keep",
      width: 1,
      height: 1,
      files: [{ key: keep, size: "card" as const, format: "jpeg" as const, w: 1, h: 1 }],
    };
    const current = {
      hash: "new",
      prefix: "looks/new",
      width: 1,
      height: 1,
      files: [...previous.files, { key: added, size: "detail" as const, format: "jpeg" as const, w: 1, h: 1 }],
    };
    try {
      await store.put(keep, new Uint8Array([1]), "image/jpeg");
      await store.put(added, new Uint8Array([2]), "image/jpeg");
      const sql = await memorySql();
      await sql`
        insert into looks (id, image_src, image_variants_json, published)
        values (${"seed"}, ${"https://img.example.test/looks/new/detail.jpg"}, ${JSON.stringify(current)}, ${true})
      `;
      await writeFile(
        backupPath,
        JSON.stringify({
          version: 1,
          looks: { seed: { imageSrc: "/looks/tiny.jpg", imageVariantsJson: JSON.stringify(previous) } },
        }),
      );

      const preview = await migrateLookPhotos(sql, { ...parseMigrateCli(["--rollback"]), backupPath, store });
      assert.deepEqual(preview.plan[0]?.keys, [added]);
      const during = await sql<{ image_src: string }>`select image_src from looks where id = ${"seed"}`;
      assert.equal(during[0]?.image_src, "https://img.example.test/looks/new/detail.jpg");
      assert.ok(await store.get(keep));
      assert.ok(await store.get(added));

      const rolled = await migrateLookPhotos(sql, { ...parseMigrateCli(["--rollback", "--apply"]), backupPath, store });
      assert.equal(rolled.deletedObjects, 1);
      const restored = await sql<{ image_src: string; image_variants_json: string }>`
        select image_src, image_variants_json from looks where id = ${"seed"}
      `;
      assert.equal(restored[0]?.image_src, "/looks/tiny.jpg");
      assert.equal(restored[0]?.image_variants_json, JSON.stringify(previous));
      assert.ok(await store.get(keep));
      assert.equal(await store.get(added), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
