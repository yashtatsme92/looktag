import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { openMemoryPglite, type EmbeddedDb } from "../providers/db/pglite.ts";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import type { Sql } from "../providers/db/types.ts";
import { addSave, listSaves, mergeGuestSaves, removeSave } from "../../server/services/saves.ts";
import {
  addCreatorFollow,
  addHouseFollow,
  listFollows,
  mergeGuestCreators,
  mergeGuestHouses,
  removeCreatorFollow,
  removeHouseFollow,
} from "../../server/services/follows.ts";

function toSql(pg: EmbeddedDb): Sql {
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
  const pg = await openMemoryPglite({ 20: (value: string) => Number(value) });
  await pg.waitReady;
  const dir = path.join(process.cwd(), "migrations");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql"));
  const files = new Map<string, string>();
  for (const name of names) files.set(name, await readFile(path.join(dir, name), "utf8"));
  for (const file of pendingMigrations([...files.keys()], [])) {
    const source = files.get(file.name);
    if (source) await pg.exec(source);
  }
  const again = files.get("0018_account_saves_follows.sql");
  if (again) await pg.exec(again);
  return toSql(pg);
}

async function insertLook(sql: Sql, id: string, published: boolean) {
  await sql`
    insert into looks (
      id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
      pin_count, compared_count, retailer_count, published, created_at, updated_at
    ) values (
      ${id}, 'creator-1', ${id}, '', 'Creator', '/looks/sunday-coat.jpg', '[]', '[]',
      0, 0, 0, ${published}, 1, 1
    )
  `;
}

describe("account save and follow services", () => {
  let sql: Sql;

  before(async () => {
    sql = await openDb();
    await sql`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      values
        ('user-a', 'A', 'a@example.com', true, now(), now()),
        ('user-b', 'B', 'b@example.com', true, now(), now())
    `;
    await sql`
      insert into profiles (user_id, display_name, handle)
      values ('creator-1', 'Creator', 'creator-1'), ('user-a', 'A', 'user-a')
    `;
    await sql`
      insert into fashion_labels (id, name, handle, bio, city, moods_json, scouted, created_at)
      values ('label-atelier-noir', 'Atelier Noir', 'atelier-noir', '', '', '[]', true, 1)
    `;
    await insertLook(sql, "look-pub", true);
    await insertLook(sql, "look-new", true);
    await insertLook(sql, "look-hidden", false);
  });

  it("adds a save once, lists newest first, and skips unpublished looks", async () => {
    const first = await addSave(sql, "user-a", "look-pub");
    assert.equal(first.status, "saved");
    const second = await addSave(sql, "user-a", "look-pub");
    assert.equal(second.status, "saved");
    if (first.status === "saved" && second.status === "saved") {
      assert.equal(second.createdAt, first.createdAt);
    }
    assert.equal((await addSave(sql, "user-a", "look-hidden")).status, "missing");
    assert.equal((await addSave(sql, "user-a", "look-missing")).status, "missing");
    const added = await addSave(sql, "user-a", "look-new");
    assert.equal(added.status, "saved");
    const listed = await listSaves(sql, "user-a");
    assert.deepEqual(
      listed.map((row) => row.lookId),
      ["look-new", "look-pub"],
    );
    await removeSave(sql, "user-a", "look-new");
    await removeSave(sql, "user-a", "look-new");
    assert.deepEqual(
      (await listSaves(sql, "user-a")).map((row) => row.lookId),
      ["look-pub"],
    );
  });

  it("merges guest saves without duplicates or unpublished ids", async () => {
    const accepted = await mergeGuestSaves(sql, "user-a", [
      "look-new",
      "look-new",
      "look-pub",
      "look-hidden",
      "not-a-look",
    ]);
    assert.deepEqual(accepted, ["look-new", "look-pub"]);
    const listed = await listSaves(sql, "user-a");
    assert.equal(listed.filter((row) => row.lookId === "look-pub").length, 1);
    assert.equal(listed.some((row) => row.lookId === "look-hidden"), false);
  });

  it("follows creators and houses idempotently and rejects self or unknown ids", async () => {
    assert.equal((await addCreatorFollow(sql, "user-a", "user-a")).status, "self");
    assert.equal((await addCreatorFollow(sql, "user-a", "missing-creator")).status, "missing");
    const followed = await addCreatorFollow(sql, "user-a", "creator-1");
    assert.equal(followed.status, "following");
    const again = await addCreatorFollow(sql, "user-a", "creator-1");
    assert.equal(again.status, "following");
    if (followed.status === "following" && again.status === "following") {
      assert.equal(again.createdAt, followed.createdAt);
    }
    assert.equal((await addHouseFollow(sql, "user-a", "missing-house")).status, "missing");
    const house = await addHouseFollow(sql, "user-a", "label-atelier-noir");
    assert.equal(house.status, "following");
    const houseAgain = await addHouseFollow(sql, "user-a", "label-atelier-noir");
    assert.equal(houseAgain.status, "following");
    if (house.status === "following" && houseAgain.status === "following") {
      assert.equal(houseAgain.createdAt, house.createdAt);
    }
    const listed = await listFollows(sql, "user-a");
    assert.deepEqual(
      listed.creators.map((row) => row.userId),
      ["creator-1"],
    );
    assert.deepEqual(
      listed.houses.map((row) => row.labelId),
      ["label-atelier-noir"],
    );
    await removeCreatorFollow(sql, "user-a", "creator-1");
    await removeCreatorFollow(sql, "user-a", "creator-1");
    await removeHouseFollow(sql, "user-a", "label-atelier-noir");
    const empty = await listFollows(sql, "user-a");
    assert.equal(empty.creators.length, 0);
    assert.equal(empty.houses.length, 0);
  });

  it("merges guest follows and ignores unknown creators, houses, and self", async () => {
    const creators = await mergeGuestCreators(sql, "user-a", ["creator-1", "creator-1", "user-a", "nope"]);
    const houses = await mergeGuestHouses(sql, "user-a", ["label-atelier-noir", "no-house", "label-atelier-noir"]);
    assert.deepEqual(creators, ["creator-1"]);
    assert.deepEqual(houses, ["label-atelier-noir"]);
    const again = await mergeGuestCreators(sql, "user-a", ["creator-1"]);
    assert.deepEqual(again, ["creator-1"]);
    assert.equal((await listFollows(sql, "user-a")).creators.length, 1);
    assert.equal((await listFollows(sql, "user-b")).creators.length, 0);
  });
});
