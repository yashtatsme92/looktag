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
} from "./account-api-contract.ts";

const createdAt = "2026-11-23T12:00:00.000Z";

describe("shared account library contracts", () => {
  it("validates save and follow API response shapes", () => {
    assert.deepEqual(
      listSavesResponseSchema.parse({ saves: [{ lookId: "seed-sunday-coat", createdAt }] }),
      { saves: [{ lookId: "seed-sunday-coat", createdAt }] },
    );
    assert.equal(
      putSaveResponseSchema.parse({ lookId: "seed-sunday-coat", saved: true, createdAt }).saved,
      true,
    );
    assert.equal(
      deleteSaveResponseSchema.parse({ lookId: "seed-sunday-coat", saved: false }).saved,
      false,
    );
    assert.deepEqual(
      listFollowsResponseSchema.parse({
        creators: [{ userId: "seed-maya-chen", createdAt }],
        houses: [{ labelId: "label-atelier-noir", createdAt }],
      }),
      {
        creators: [{ userId: "seed-maya-chen", createdAt }],
        houses: [{ labelId: "label-atelier-noir", createdAt }],
      },
    );
    assert.equal(
      putCreatorFollowResponseSchema.parse({ userId: "seed-maya-chen", following: true, createdAt })
        .following,
      true,
    );
    assert.equal(
      putHouseFollowResponseSchema.parse({
        labelId: "label-atelier-noir",
        following: true,
        createdAt,
      }).following,
      true,
    );
    assert.deepEqual(accountApiErrorSchema.parse({ error: "Unauthorized" }), {
      error: "Unauthorized",
    });
  });

  it("limits guest merges and fills omitted lists", () => {
    assert.deepEqual(mergeGuestRequestSchema.parse({}), { saves: [], creators: [], houses: [] });
    const tooMany = Array.from({ length: GUEST_MERGE_LIMIT + 1 }, (_, index) => `look-${index}`);
    assert.equal(mergeGuestRequestSchema.safeParse({ saves: tooMany }).success, false);
    assert.equal(mergeGuestRequestSchema.safeParse({ saves: ["bad id"] }).success, false);
    assert.deepEqual(
      mergeGuestResponseSchema.parse({
        saves: ["seed-sunday-coat"],
        creators: ["seed-maya-chen"],
        houses: ["label-atelier-noir"],
      }),
      {
        saves: ["seed-sunday-coat"],
        creators: ["seed-maya-chen"],
        houses: ["label-atelier-noir"],
      },
    );
  });
});
