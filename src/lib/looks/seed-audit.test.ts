import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { openMemoryPglite } from "../providers/db/pglite.ts";
import { runMigrate } from "../../../scripts/apply-migrations.mjs";
import { closeSeedLoader, seedDatabase, toSql } from "../../../scripts/seed.mjs";
import { auditDatabase, formatAudit } from "../../../scripts/seed-audit.mjs";
import { formatPrune, isLocalDatabase, pruneGuard, pruneUnseededLooks } from "../../../scripts/seed-prune.mjs";
import { imageKey } from "../../../scripts/seed-ledger.mjs";

function adapt(pg: Awaited<ReturnType<typeof openMemoryPglite>>) {
  return {
    query: async (text: string, params: unknown[] = []) => {
      const result = await pg.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    },
    exec: (text: string) => pg.exec(text),
  };
}

describe("seed audit and prune", () => {
  it("refuses production and any non-local database unless allow-production is set", () => {
    const neon = "postgresql://user:password@ep-example-pooler.eu-central-1.aws.neon.tech/neondb";
    assert.equal(isLocalDatabase(undefined), true);
    assert.equal(isLocalDatabase(""), true);
    assert.equal(isLocalDatabase("pglite"), true);
    assert.equal(isLocalDatabase("postgres://looktag@127.0.0.1/looktag"), true);
    assert.equal(isLocalDatabase("postgres://looktag@localhost/looktag"), true);
    assert.equal(isLocalDatabase(neon), false);

    const refusedEnv = pruneGuard({ NODE_ENV: "production", DATABASE_URL: "postgres://localhost/db" }, []);
    assert.equal(refusedEnv.ok, false);
    assert.match(refusedEnv.error, /NODE_ENV=production/);
    assert.equal(pruneGuard({ NODE_ENV: "production" }, ["--allow-production"]).ok, true);

    const refusedHost = pruneGuard({ DATABASE_URL: neon }, ["--confirm"]);
    assert.equal(refusedHost.ok, false);
    assert.match(refusedHost.error, /non-local database/);
    assert.doesNotMatch(refusedHost.error, /neon\.tech|postgres(ql)?:\/\//i);
    assert.equal(pruneGuard({ DATABASE_URL: neon }, ["--allow-production", "--confirm"]).ok, true);
    assert.equal(pruneGuard({ NODE_ENV: "test", DATABASE_URL: "postgres://127.0.0.1/db" }, ["--confirm"]).confirm, true);
    assert.equal(
      pruneGuard({ DATABASE_URL: "postgres://127.0.0.1/db" }, ["--include-user-looks"]).includeUserLooks,
      true,
    );
  });

  it("keeps repo seed and user looks, and removes an editorial leftover only when confirm is passed", async () => {
    assert.equal(imageKey("data:image/jpeg;base64,AAAA", "upload-1"), "data:upload-1");
    assert.match(formatAudit([]), /not-seeded 0/);
    const refused = pruneGuard({ NODE_ENV: "production" }, []);
    assert.equal(refused.ok, false);
    assert.equal(pruneGuard({ NODE_ENV: "production" }, ["--allow-production"]).ok, true);
    assert.equal(pruneGuard({ NODE_ENV: "test" }, ["--confirm"]).confirm, true);

    const pg = await openMemoryPglite();
    try {
      const db = adapt(pg);
      await runMigrate(db, {
        migrationsDir: path.join(process.cwd(), "migrations"),
        authEnabled: true,
      });
      await seedDatabase(toSql(db));
      const seeded = await auditDatabase((text, params) => db.query(text, params ?? []));
      const seededReport = formatAudit(seeded);
      assert.match(seededReport, /not-seeded 0/);
      assert.doesNotMatch(seededReport, /postgres(ql)?:\/\//i);
      assert.equal(seeded.some((row) => row.kind === "look" && row.id.startsWith("house-") && row.seeded), true);
      assert.equal(seeded.some((row) => row.kind === "house" && row.seeded), true);

      const bytes = "data:image/jpeg;base64," + "A".repeat(80);
      const insertLook = (id: string, userId: string) =>
        db.query(
          `insert into looks (
            id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
            pin_count, compared_count, retailer_count, published, created_at, updated_at, crop_json
          ) values ($1, $2, $3, '', 'Uploader', $4, '[]', $5, 1, 0, 0, true, 1, 1, '{"x":0}')`,
          [id, userId, id, id === "upload-1" ? bytes : "/uploads/stray.jpg", JSON.stringify([{ id: "pin-1", name: "Coat" }])],
        );
      await insertLook("upload-1", "user-upload");
      await insertLook("stray-editorial", "editorial");
      await db.query(
        `insert into fashion_labels (id, name, handle, created_at) values ('label-extra', 'Extra', 'extra-house', 1)`,
      );

      const flagged = await auditDatabase((text, params) => db.query(text, params ?? []));
      assert.equal(flagged.some((row) => row.kind === "look" && row.id === "upload-1" && !row.seeded), true);
      assert.equal(
        flagged.some((row) => row.kind === "image" && row.id === "data:upload-1" && !row.seeded),
        true,
      );
      assert.equal(
        flagged.some((row) => row.kind === "product" && row.id === "upload-1:pin-1" && !row.seeded),
        true,
      );
      assert.doesNotMatch(formatAudit(flagged), /base64|AAAA/);

      const dry = await pruneUnseededLooks((text, params) => db.query(text, params ?? []), { confirm: false });
      assert.deepEqual(dry.looks, ["stray-editorial"]);
      assert.deepEqual(dry.skippedUserLooks, [{ userId: "user-upload", count: 1 }]);
      assert.deepEqual(dry.houses, ["label-extra"]);
      assert.equal((await db.query("select id from looks where id = 'upload-1'")).rows.length, 1);
      const dryText = formatPrune(dry);
      assert.match(dryText, /dry-run 1/);
      assert.match(dryText, /user user-upload: 1 look\(s\)/);
      assert.match(dryText, /warning: 1 real user look/);
      assert.match(dryText, /audit-only 1 not-seeded house/);
      assert.doesNotMatch(dryText, /@|deleted .* image crop offers/);
      assert.match(dryText, /columns on this look row/);

      const removed = await pruneUnseededLooks((text, params) => db.query(text, params ?? []), { confirm: true });
      assert.deepEqual(removed.looks, ["stray-editorial"]);
      assert.equal((await db.query("select id from looks where id = 'upload-1'")).rows.length, 1);
      assert.equal((await db.query("select id from looks where id = 'stray-editorial'")).rows.length, 0);
      assert.equal((await db.query("select id from fashion_labels where id = 'label-extra'")).rows.length, 1);

      const withUsers = await pruneUnseededLooks((text, params) => db.query(text, params ?? []), {
        confirm: true,
        includeUserLooks: true,
      });
      assert.deepEqual(withUsers.looks, ["upload-1"]);
      assert.match(formatPrune(withUsers), /deleted 1 real user look/);
      assert.equal((await db.query("select id from looks where id = 'upload-1'")).rows.length, 0);
      const after = await auditDatabase((text, params) => db.query(text, params ?? []));
      assert.equal(after.some((row) => row.kind === "house" && row.id === "label-extra" && !row.seeded), true);
      assert.equal(after.some((row) => row.kind === "look" && row.id === "seed-sunday-coat" && row.seeded), true);
    } finally {
      await closeSeedLoader();
      await pg.close();
    }
  });

  it("rolls back every delete when a later look fails", async () => {
    const pg = await openMemoryPglite();
    try {
      const db = adapt(pg);
      await runMigrate(db, {
        migrationsDir: path.join(process.cwd(), "migrations"),
        authEnabled: true,
      });
      const insertLook = (id: string) =>
        db.query(
          `insert into looks (
            id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
            pin_count, compared_count, retailer_count, published, created_at, updated_at, crop_json
          ) values ($1, 'editorial', $1, '', 'Editorial', '/uploads/stray.jpg', '[]', '[]', 0, 0, 0, true, 1, 1, null)`,
          [id],
        );
      await insertLook("tx-a");
      await insertLook("tx-b");
      await assert.rejects(
        () =>
          pruneUnseededLooks((text, params) => db.query(text, params ?? []), {
            confirm: true,
            failOnId: "tx-b",
          }),
        /injected failure/,
      );
      const left = await db.query("select id from looks where id in ('tx-a', 'tx-b') order by id");
      assert.deepEqual(
        left.rows.map((row) => row.id),
        ["tx-a", "tx-b"],
      );
    } finally {
      await pg.close();
    }
  });
});
