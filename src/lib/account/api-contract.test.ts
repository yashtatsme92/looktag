import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUEST_MERGE_LIMIT,
  accountApiErrorSchema,
  deleteSaveResponseSchema,
  listFollowsResponseSchema,
  listSavesResponseSchema,
  mergeGuestRequestSchema,
  mergeGuestResponseSchema,
  putCreatorFollowResponseSchema,
  putHouseFollowResponseSchema,
  putSaveResponseSchema,
} from "./api-contract.ts";

const at = "2026-11-23T12:00:00.000Z";

describe("account library contracts", () => {
  it("parses save and follow payloads native can share", () => {
    const saves = listSavesResponseSchema.parse({
      saves: [{ lookId: "seed-sunday-coat", createdAt: at }],
    });
    assert.equal(saves.saves[0]?.lookId, "seed-sunday-coat");
    assert.equal(putSaveResponseSchema.parse({ lookId: "seed-sunday-coat", saved: true, createdAt: at }).saved, true);
    assert.equal(deleteSaveResponseSchema.parse({ lookId: "seed-sunday-coat", saved: false }).saved, false);
    const follows = listFollowsResponseSchema.parse({
      creators: [{ userId: "seed-maya-chen", createdAt: at }],
      houses: [{ labelId: "label-atelier-noir", createdAt: at }],
    });
    assert.equal(follows.houses[0]?.labelId, "label-atelier-noir");
    assert.equal(
      putCreatorFollowResponseSchema.parse({ userId: "seed-maya-chen", following: true, createdAt: at }).following,
      true,
    );
    assert.equal(
      putHouseFollowResponseSchema.parse({ labelId: "label-atelier-noir", following: true, createdAt: at }).following,
      true,
    );
    assert.deepEqual(accountApiErrorSchema.parse({ error: "Unauthorized" }), { error: "Unauthorized" });
  });

  it("caps guest merge arrays and fills missing lists", () => {
    const empty = mergeGuestRequestSchema.parse({});
    assert.deepEqual(empty, { saves: [], creators: [], houses: [] });
    const tooMany = Array.from({ length: GUEST_MERGE_LIMIT + 1 }, (_, index) => `look-${index}`);
    assert.equal(mergeGuestRequestSchema.safeParse({ saves: tooMany }).success, false);
    assert.equal(mergeGuestRequestSchema.safeParse({ saves: ["bad id"] }).success, false);
    const accepted = mergeGuestResponseSchema.parse({
      saves: ["seed-sunday-coat"],
      creators: ["seed-maya-chen"],
      houses: ["label-atelier-noir"],
    });
    assert.deepEqual(accepted.saves, ["seed-sunday-coat"]);
  });
});
