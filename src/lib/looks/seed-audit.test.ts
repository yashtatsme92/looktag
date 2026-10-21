import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { openMemoryPglite } from "../providers/db/pglite.ts";
import { runMigrate } from "../../../scripts/apply-migrations.mjs";
import { closeSeedLoader, seedDatabase, toSql } from "../../../scripts/seed.mjs";
import { auditDatabase, formatAudit } from "../../../scripts/seed-audit.mjs";
import { formatPrune, pruneGuard, pruneUnseededLooks } from "../../../scripts/seed-prune.mjs";
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
  it("keeps repo seed and removes an uploaded look only when confirm is passed", async () => {
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
      await db.query(
        `insert into looks (
          id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
          pin_count, compared_count, retailer_count, published, created_at, updated_at, crop_json
        ) values ($1, $2, $3, '', 'Uploader', $4, '[]', $5, 1, 0, 0, true, 1, 1, '{"x":0}')`,
        ["upload-1", "user-upload", "Uploaded", bytes, JSON.stringify([{ id: "pin-1", name: "Coat" }])],
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
      assert.deepEqual(dry, { dryRun: true, looks: ["upload-1"] });
      assert.equal((await db.query("select id from looks where id = 'upload-1'")).rows.length, 1);
      assert.match(formatPrune(dry), /dry-run 1/);

      const removed = await pruneUnseededLooks((text, params) => db.query(text, params ?? []), { confirm: true });
      assert.deepEqual(removed.looks, ["upload-1"]);
      assert.equal((await db.query("select id from looks where id = 'upload-1'")).rows.length, 0);
      const after = await auditDatabase((text, params) => db.query(text, params ?? []));
      assert.match(formatAudit(after), /not-seeded 0/);
      assert.equal(after.some((row) => row.kind === "look" && row.id === "seed-sunday-coat" && row.seeded), true);
    } finally {
      await closeSeedLoader();
      await pg.close();
    }
  });
});
