import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer as createVite } from "vite";
import { randomBytes } from "node:crypto";

let vite;
let base;
let sql;

const rowInsert = `insert into looks (
  id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
  pin_count, compared_count, retailer_count, published, created_at, updated_at,
  collection_id, crop_json
) values ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, $9, $10, $10, null, null)`;

async function insertLook(id, { published, tags = [] }) {
  await sql.query(rowInsert, [
    id,
    `api-test-${id}`,
    `API test ${id}`,
    "test caption",
    "API test",
    "/looks/sunday-coat.jpg",
    "[]",
    JSON.stringify(tags),
    published,
    Date.now(),
  ]);
}

describe("public looks HTTP API", () => {
  before(async () => {
    process.env.DB_PROVIDER = "pglite";
    process.env.LOOKTAG_ALLOW_EPHEMERAL_DB = "1";
    vite = await createVite({
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "silent",
    });
    const database = await vite.ssrLoadModule("/src/lib/db.ts");
    sql = await database.getSql();
    await vite.listen();
    const address = vite.httpServer.address();
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await vite?.close();
  });

  it("omits unpublished looks and returns 404 for their detail route", async () => {
    const id = `api-unpublished-${randomBytes(8).toString("hex")}`;
    await insertLook(id, { published: false });

    const feed = await fetch(`${base}/api/v1/looks`);
    assert.equal(feed.status, 200);
    assert.equal(feed.headers.get("cache-control"), "no-store");
    assert.equal((await feed.json()).some((look) => look.id === id), false);

    const detail = await fetch(`${base}/api/v1/looks/${id}`);
    assert.equal(detail.status, 404);
    assert.equal(detail.headers.get("cache-control"), "no-store");
    assert.deepEqual(await detail.json(), { error: "Not found" });

    await sql.query("update looktag_settings set labels_enabled = $1", [false]);
    const labelsDisabledFeed = await fetch(`${base}/api/v1/looks`);
    assert.equal(labelsDisabledFeed.status, 200);
    assert.equal(
      (await labelsDisabledFeed.json()).some((look) => look.id === id),
      false,
    );
    await sql.query("update looktag_settings set labels_enabled = $1", [true]);
  });

  it("skips malformed public looks in the feed and returns a no-store JSON error for detail", async () => {
    const id = `api-malformed-${randomBytes(8).toString("hex")}`;
    await insertLook(id, { published: true, tags: [{ id: "incomplete-pin" }] });

    const feed = await fetch(`${base}/api/v1/looks`);
    assert.equal(feed.status, 200);
    assert.equal(feed.headers.get("cache-control"), "no-store");
    assert.equal((await feed.json()).some((look) => look.id === id), false);

    const detail = await fetch(`${base}/api/v1/looks/${id}`);
    assert.equal(detail.status, 500);
    assert.equal(detail.headers.get("content-type"), "application/json");
    assert.equal(detail.headers.get("cache-control"), "no-store");
    assert.deepEqual(await detail.json(), { error: "Unable to serialize look" });
  });
});
