import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import type { Sql } from "../db.ts";

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

async function openDb() {
  const pg = new PGlite();
  await pg.waitReady;
  const names = (await readdir(path.join(process.cwd(), "migrations"))).filter((name) =>
    name.endsWith(".sql"),
  );
  const files = new Map<string, string>();
  for (const name of names) {
    files.set(name, await readFile(path.join(process.cwd(), "migrations", name), "utf8"));
  }
  for (const file of pendingMigrations([...files.keys()], [])) {
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
      const { insertLookRow, seedCatalog } = (await vite.ssrLoadModule(
        "/src/lib/looks/looks-shared.ts",
      )) as typeof import("./looks-shared.ts");
      const { EDITORIAL_USER_ID } = (await vite.ssrLoadModule(
        "/src/lib/looks/types.ts",
      )) as typeof import("./types.ts");
      const { SEED_LOOKS } = (await vite.ssrLoadModule(
        "/src/lib/looks/seed.ts",
      )) as typeof import("./seed.ts");
      const { pg, sql } = databases[0]!;
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
      const afterFirstSeed = await sql`
        select * from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.equal(afterFirstSeed.length, SEED_LOOKS.length);
      assert.deepEqual(
        afterFirstSeed.map((row) => row.id),
        SEED_LOOKS.map((look) => look.id).sort(),
      );
      assert.deepEqual(afterFirstSeed.find((row) => row.id === existing.id), before[0]);

      await seedCatalog(toSql(pg));
      const afterSecondSeed = await sql`
        select * from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.deepEqual(afterSecondSeed, afterFirstSeed);

      const deleted = SEED_LOOKS[1];
      assert.ok(deleted);
      await sql`delete from looks where id = ${deleted.id}`;
      await seedCatalog(toSql(pg));
      const afterDeleteReseed = await sql`
        select id from looks where user_id = ${EDITORIAL_USER_ID} order by id
      `;
      assert.equal(afterDeleteReseed.length, SEED_LOOKS.length - 1);
      assert.equal(afterDeleteReseed.some((row) => row.id === deleted.id), false);

      databases.push(await openDb(), await openDb());
      await Promise.all(databases.slice(1).map(({ sql: otherSql }) => seedCatalog(otherSql)));
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
});
