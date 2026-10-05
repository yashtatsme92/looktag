import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import type { Sql } from "../db.ts";
import type { FashionStyle } from "./model.ts";
import {
  deleteLineStyles,
  deleteStyleForHouse,
  ensureHouseStyleSchema,
  insertSeedStyles,
  listPublicStyles,
  listStylesForLabel,
  moveStyleForHouse,
  saveStyleForHouse,
  setHouseCover,
} from "./style-record.ts";

function toSql(pg: PGlite): Sql {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1] ?? ""}`;
    }
    const result = await pg.query<T>(text, values);
    return result.rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };
  return sql;
}

async function openDb(): Promise<Sql> {
  const pg = new PGlite({ parsers: { 20: (value: string) => Number(value) } });
  await pg.waitReady;
  const dir = path.join(process.cwd(), "migrations");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql"));
  const files = new Map<string, string>();
  for (const name of names) files.set(name, await readFile(path.join(dir, name), "utf8"));
  for (const file of pendingMigrations([...files.keys()], [])) {
    const source = files.get(file.name);
    if (source) await pg.exec(source);
  }
  return toSql(pg);
}

describe("house style records", () => {
  let sql: Sql;

  before(async () => {
    sql = await openDb();
    await ensureHouseStyleSchema(sql);
    await ensureHouseStyleSchema(sql);
    await sql`
      insert into fashion_labels (id, name, handle, bio, city, moods_json, scouted, created_at, status)
      values
        ('house-a', 'House A', 'housea', 'About', 'Paris', '[]', true, 1, 'approved'),
        ('house-b', 'House B', 'houseb', 'About', 'Lyon', '[]', false, 2, 'pending')
    `;
    await sql`
      insert into fashion_collections (id, label_id, name, slug, caption, season, moods_json, sort_order, created_at)
      values
        ('col-a', 'house-a', 'First', 'first', 'A note', 'Capsule', '[]', 0, 1),
        ('col-b', 'house-a', 'Second', 'second', '', 'Night', '[]', 1, 2),
        ('col-c', 'house-b', 'Other', 'other', '', '', '[]', 0, 3)
    `;
  });

  it("saves photos, fills an empty cover, reorders, and moves the cover when that photo goes", async () => {
    const first = await saveStyleForHouse(sql, "house-a", {
      collectionId: "col-a",
      name: "Column Dress",
      description: "Wool",
      imageSrc: "/looks/gallery-hour.jpg",
      images: ["/looks/gallery-hour.jpg", "/looks/sunday-coat.jpg"],
    });
    assert.equal(first.collectionSlug, "first");
    assert.deepEqual(first.images, ["/looks/gallery-hour.jpg", "/looks/sunday-coat.jpg"]);
    const filled = await sql<{ cover_src: string }>`select cover_src from fashion_labels where id = 'house-a'`;
    assert.equal(filled[0]?.cover_src, "/looks/gallery-hour.jpg");

    const second = await saveStyleForHouse(sql, "house-a", {
      collectionId: "col-a",
      name: "Bar Cuff",
      imageSrc: "/looks/city-cut.jpg",
    });
    const held = await sql<{ cover_src: string }>`select cover_src from fashion_labels where id = 'house-a'`;
    assert.equal(held[0]?.cover_src, "/looks/gallery-hour.jpg");

    await setHouseCover(sql, "house-a", "/looks/quiet-tailor.jpg");
    const explicit = await sql<{ cover_src: string }>`select cover_src from fashion_labels where id = 'house-a'`;
    assert.equal(explicit[0]?.cover_src, "/looks/quiet-tailor.jpg");

    const moved = await moveStyleForHouse(sql, "house-a", second.id, "up");
    const siblings = moved.filter((style) => style.collectionId === "col-a");
    assert.deepEqual(siblings.map((style) => style.id), [second.id, first.id]);

    await setHouseCover(sql, "house-a", first.imageSrc);
    await deleteStyleForHouse(sql, "house-a", first.id);
    const next = await sql<{ cover_src: string }>`select cover_src from fashion_labels where id = 'house-a'`;
    assert.equal(next[0]?.cover_src, second.imageSrc);
    const listed = await listStylesForLabel(sql, "house-a");
    assert.equal(listed.some((style) => style.id === first.id), false);
  });

  it("refuses a line from another house and hides pending styles from shoppers", async () => {
    await assert.rejects(
      () =>
        saveStyleForHouse(sql, "house-a", {
          collectionId: "col-c",
          name: "Nope",
          imageSrc: "/looks/studio-knit.jpg",
        }),
      /not on your House/,
    );
    await saveStyleForHouse(sql, "house-b", {
      collectionId: "col-c",
      name: "Hidden",
      imageSrc: "/looks/studio-knit.jpg",
    });
    const pub = await listPublicStyles(sql);
    assert.equal(pub.some((style) => style.labelId === "house-b"), false);
    assert.equal(pub.some((style) => style.labelId === "house-a"), true);
  });

  it("does not overwrite an edited seed style and drops a line's photos with its cover", async () => {
    const seed: FashionStyle = {
      id: "style-seed",
      labelId: "house-a",
      collectionId: "col-b",
      name: "Seeded",
      description: "",
      imageSrc: "/looks/coastal-linen.jpg",
      sortOrder: 0,
    };
    await insertSeedStyles(sql, [seed]);
    await sql`update fashion_styles set name = 'Edited' where id = 'style-seed'`;
    await insertSeedStyles(sql, [{ ...seed, name: "Seeded again" }]);
    const edited = (await listStylesForLabel(sql, "house-a")).find((style) => style.id === "style-seed");
    assert.equal(edited?.name, "Edited");

    await setHouseCover(sql, "house-a", seed.imageSrc);
    await deleteLineStyles(sql, "house-a", "col-b");
    const gone = await listStylesForLabel(sql, "house-a");
    assert.equal(gone.some((style) => style.collectionId === "col-b"), false);
    const cover = await sql<{ cover_src: string }>`select cover_src from fashion_labels where id = 'house-a'`;
    assert.equal(cover[0]?.cover_src, "/looks/city-cut.jpg");
    const site = await sql<{ website: string }>`
      update fashion_labels set website = 'https://atelier.example/' where id = 'house-a'
      returning website
    `;
    assert.equal(site[0]?.website, "https://atelier.example/");
  });
});
