import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import type { Sql } from "../db.ts";
import type { LookRow } from "./looks-shared.ts";
import { backfillLookCrops } from "../../../scripts/backfill-look-crops.mjs";

const SEED_LEDGER_MIGRATIONS = new Set([
  "0011_seeded_items.sql",
  "0012_backfill_creator_seeded_items.sql",
]);

function toSql(pg: PGlite): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
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

async function openDb(includeSeedLedger = true) {
  const pg = new PGlite();
  await pg.waitReady;
  const names = (await readdir(path.join(process.cwd(), "migrations"))).filter((name) =>
    name.endsWith(".sql"),
  );
  const files = new Map<string, string>();
  for (const name of names) {
    files.set(name, await readFile(path.join(process.cwd(), "migrations", name), "utf8"));
  }
  const migrations = [...files.keys()].filter(
    (name) => includeSeedLedger || !SEED_LEDGER_MIGRATIONS.has(name),
  );
  for (const file of pendingMigrations(migrations, [])) {
    const source = files.get(file.name);
    if (source) await pg.exec(source);
  }
  return { pg, sql: toSql(pg) };
}

describe("editorial look seeding", () => {
  it("preserves old rows, records deletions, and seeds each database independently", async () => {
    const databases = [await openDb()];
    const vite = await createServer({
      configFile: false,
      root: process.cwd(),
      resolve: { alias: { "@": path.join(process.cwd(), "src") } },
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    try {
      const { insertLookRow, parseLook, seedCatalog } = (await vite.ssrLoadModule(
        "/src/lib/looks/looks-shared.ts",
      )) as typeof import("./looks-shared.ts");
      const { EDITORIAL_USER_ID } = (await vite.ssrLoadModule(
        "/src/lib/looks/types.ts",
      )) as typeof import("./types.ts");
      const { SEED_LOOKS } = (await vite.ssrLoadModule(
        "/src/lib/looks/seed.ts",
      )) as typeof import("./seed.ts");
      const { pg, sql } = databases[0]!;
      assert.deepEqual(await sql`select id from seeded_items`, []);
      const existing = SEED_LOOKS[0];
      assert.ok(existing);
      await insertLookRow(sql, existing, EDITORIAL_USER_ID);
      await sql`
        update looks
        set title = 'Edited editorial title', caption = 'Edited editorial caption'
        where id = ${existing.id}
      `;
      const before = await sql`select * from looks where id = ${existing.id}`;

      await seedCatalog(sql);
      await backfillLookCrops(sql);
      const afterFirstSeed = await sql`
        select * from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.equal(afterFirstSeed.length, SEED_LOOKS.length);
      assert.deepEqual(
        afterFirstSeed.map((row) => row.id),
        SEED_LOOKS.map((look) => look.id).sort(),
      );
      const migratedExisting = afterFirstSeed.find((row) => row.id === existing.id);
      assert.ok(migratedExisting?.crop_json);
      assert.deepEqual(migratedExisting, { ...before[0], crop_json: migratedExisting.crop_json });

      await seedCatalog(toSql(pg));
      await backfillLookCrops(toSql(pg));
      const afterSecondSeed = await sql`
        select * from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.deepEqual(afterSecondSeed, afterFirstSeed);

      const deleted = SEED_LOOKS[1];
      assert.ok(deleted);
      await sql`delete from looks where id = ${deleted.id}`;
      await seedCatalog(toSql(pg));
      await backfillLookCrops(toSql(pg));
      const afterDeleteReseed = await sql`
        select id from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.equal(afterDeleteReseed.length, SEED_LOOKS.length - 1);
      assert.equal(afterDeleteReseed.some((row) => row.id === deleted.id), false);

      const crop = { x: 0.2, y: 0.1, w: 0.5, h: 0.75 };
      const cropLook = { ...existing, id: "crop-roundtrip", crop };
      await insertLookRow(sql, cropLook, EDITORIAL_USER_ID);
      const cropRows = await sql`
        select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
               created_at, updated_at, collection_id, crop_json
        from looks where id = ${cropLook.id}
      `;
      assert.deepEqual(parseLook(cropRows[0] as LookRow).crop, crop);

      databases.push(await openDb(), await openDb());
      await Promise.all(
        databases.slice(1).map(async ({ sql: otherSql }) => {
          await seedCatalog(otherSql);
          await backfillLookCrops(otherSql);
        }),
      );
      for (const { sql: otherSql } of databases.slice(1)) {
        const rows = await otherSql`
          select id from looks where user_id = ${EDITORIAL_USER_ID} order by id
        `;
        assert.equal(rows.length, SEED_LOOKS.length);
      }
    } finally {
      await vite.close();
      await Promise.all(databases.map(({ pg }) => pg.close()));
    }
  });

  it("upgrades a legacy database without restoring a deleted original seed", async () => {
    const { pg, sql } = await openDb(false);
    const vite = await createServer({
      configFile: false,
      root: process.cwd(),
      resolve: { alias: { "@": path.join(process.cwd(), "src") } },
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    try {
      const { insertLookRow, seedCatalog } = (await vite.ssrLoadModule(
        "/src/lib/looks/looks-shared.ts",
      )) as typeof import("./looks-shared.ts");
      const { EDITORIAL_USER_ID } = (await vite.ssrLoadModule(
        "/src/lib/looks/types.ts",
      )) as typeof import("./types.ts");
      const { SEED_LOOKS } = (await vite.ssrLoadModule(
        "/src/lib/looks/seed.ts",
      )) as typeof import("./seed.ts");
      const legacyLooks = SEED_LOOKS.slice(0, 6);
      const deleted = legacyLooks[2]!;
      for (const look of legacyLooks) {
        await insertLookRow(sql, look, EDITORIAL_USER_ID);
      }
      await sql`delete from looks where id = ${deleted.id}`;
      const existingRows = await sql`
        select * from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;

      const migration = await readFile(
        path.join(process.cwd(), "migrations/0011_seeded_items.sql"),
        "utf8",
      );
      await pg.exec(migration);
      const ledgerBeforeRerun = await sql`
        select kind, id, seeded_at from seeded_items order by kind, id
      `;
      assert.equal(ledgerBeforeRerun.length, legacyLooks.length);
      await pg.exec(migration);
      assert.deepEqual(
        await sql`select kind, id, seeded_at from seeded_items order by kind, id`,
        ledgerBeforeRerun,
      );

      await seedCatalog(sql);
      await backfillLookCrops(sql);
      const afterUpgrade = await sql`
        select * from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.equal(afterUpgrade.length, SEED_LOOKS.length - 1);
      assert.equal(afterUpgrade.some((row) => row.id === deleted.id), false);
      assert.equal(
        afterUpgrade.filter((row) => !legacyLooks.some((look) => look.id === row.id)).length,
        28,
      );
      for (const row of existingRows) {
        const migrated = afterUpgrade.find((candidate) => candidate.id === row.id);
        assert.ok(migrated?.crop_json);
        assert.deepEqual({ ...migrated, crop_json: row.crop_json }, row);
      }

      await seedCatalog(toSql(pg));
      await backfillLookCrops(toSql(pg));
      assert.deepEqual(
        await sql`select * from looks where user_id = ${EDITORIAL_USER_ID} order by id`,
        afterUpgrade,
      );
    } finally {
      await vite.close();
      await pg.close();
    }
  });

  it("backfills only existing creator seeds and preserves a later deletion", async () => {
    const { pg, sql } = await openDb(false);
    const vite = await createServer({
      configFile: false,
      root: process.cwd(),
      resolve: { alias: { "@": path.join(process.cwd(), "src") } },
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    try {
      const { insertLookRow, seedCatalog } = (await vite.ssrLoadModule(
        "/src/lib/looks/looks-shared.ts",
      )) as typeof import("./looks-shared.ts");
      const { EDITORIAL_USER_ID } = (await vite.ssrLoadModule(
        "/src/lib/looks/types.ts",
      )) as typeof import("./types.ts");
      const { SEED_LOOKS } = (await vite.ssrLoadModule(
        "/src/lib/looks/seed.ts",
      )) as typeof import("./seed.ts");

      const seedLedgerMigration = await readFile(
        path.join(process.cwd(), "migrations/0011_seeded_items.sql"),
        "utf8",
      );
      const creatorSeedMigration = await readFile(
        path.join(process.cwd(), "migrations/0012_backfill_creator_seeded_items.sql"),
        "utf8",
      );
      await pg.exec(seedLedgerMigration);

      const missingDuringBackfill = SEED_LOOKS[6]!;
      for (const look of SEED_LOOKS) {
        if (look.id !== missingDuringBackfill.id) {
          await insertLookRow(sql, look, EDITORIAL_USER_ID);
        }
      }
      await pg.exec(creatorSeedMigration);

      const backfilledIds = await sql<{ id: string }>`
        select id from seeded_items where kind = 'editorial_look' order by id
      `;
      assert.deepEqual(
        backfilledIds.map((row) => row.id),
        SEED_LOOKS.slice(6)
          .filter((look) => look.id !== missingDuringBackfill.id)
          .map((look) => look.id)
          .sort(),
      );

      await seedCatalog(sql);
      const allLooks = await sql<{ id: string }>`
        select id from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      const ledgerBeforeDelete = await sql`
        select kind, id, seeded_at from seeded_items order by kind, id
      `;
      assert.deepEqual(
        allLooks.map((row) => row.id),
        SEED_LOOKS.map((look) => look.id).sort(),
      );
      assert.equal(
        ledgerBeforeDelete.filter((row) => row.kind === "editorial_look").length,
        34,
      );
      assert.equal(ledgerBeforeDelete.filter((row) => row.kind === "house_look").length, 7);

      const deleted = SEED_LOOKS[10]!;
      await sql`delete from looks where id = ${deleted.id}`;
      await seedCatalog(toSql(pg));
      assert.equal(
        (await sql`select id from looks where id = ${deleted.id}`).length,
        0,
      );

      await pg.exec(creatorSeedMigration);
      assert.deepEqual(
        await sql`select kind, id, seeded_at from seeded_items order by kind, id`,
        ledgerBeforeDelete,
      );
      await seedCatalog(toSql(pg));
      assert.equal(
        (await sql`select id from looks where id = ${deleted.id}`).length,
        0,
      );
    } finally {
      await vite.close();
      await pg.close();
    }
  });
});
