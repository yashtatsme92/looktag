import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { openMemoryPglite, type EmbeddedDb } from "./providers/db/pglite.ts";
import { runMigrate } from "../../scripts/apply-migrations.mjs";
import { closeSeedLoader, seedDatabase, toSql } from "../../scripts/seed.mjs";

function adapt(pg: EmbeddedDb) {
  return {
    query: async (text: string, params: unknown[] = []) => {
      const result = await pg.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    },
    exec: (text: string) => pg.exec(text),
  };
}

async function counts(pg: EmbeddedDb) {
  const tables = [
    "looks",
    "fashion_labels",
    "fashion_collections",
    "fashion_styles",
    "seeded_items",
    "_migrations",
  ];
  const totals: Record<string, number> = {};
  for (const table of tables) {
    const result = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    totals[table] = Number(result.rows[0]?.n ?? 0);
  }
  const names = await pg.query<{ name: string }>("select name from _migrations order by name");
  return { totals, names: names.rows.map((row) => row.name) };
}

describe("migrate and seed idempotency", () => {
  it("applies each migration once and does not change seed rows on a second run", async () => {
    const pg = await openMemoryPglite();
    await pg.waitReady;
    const db = adapt(pg);
    const migrationsDir = path.join(process.cwd(), "migrations");
    const expected = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

    const first = await runMigrate(db, { migrationsDir, authEnabled: true });
    assert.ok(first.applied >= expected.length);
    const afterMigrate = await counts(pg);
    assert.deepEqual(afterMigrate.names, expected);
    assert.equal(new Set(afterMigrate.names).size, afterMigrate.names.length);

    const second = await runMigrate(db, { migrationsDir, authEnabled: true });
    assert.equal(second.applied, 0);
    const afterSecondMigrate = await counts(pg);
    assert.deepEqual(afterSecondMigrate, afterMigrate);

    const sql = toSql(db);
    await seedDatabase(sql);
    const seeded = await counts(pg);
    assert.ok(seeded.totals.looks > 0, "editorial looks are seeded from code");
    assert.ok(seeded.totals.fashion_labels > 0);
    assert.ok(seeded.totals.fashion_collections > 0);
    assert.ok(seeded.totals.fashion_styles > 0);
    assert.ok(seeded.totals.seeded_items > 0);
    const houseLedger = await pg.query<{ id: string }>(
      "select id from seeded_items where kind = 'house_look' order by id",
    );
    assert.equal(houseLedger.rows.length, 7);
    const cropped = await pg.query<{ n: number }>(
      "select count(*)::int as n from looks where id like 'house-%' and crop_json like '%\"w\"%'",
    );
    assert.equal(Number(cropped.rows[0]?.n), 7);

    await seedDatabase(sql);
    const reseeded = await counts(pg);
    assert.deepEqual(reseeded, seeded);

    await pg.query("delete from looks where id = 'house-noir-column'");
    await seedDatabase(sql);
    const restored = await pg.query("select id from looks where id = 'house-noir-column'");
    assert.equal(restored.rows.length, 0);
    await closeSeedLoader();
    await pg.close();
  });
});
