import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLookRequestSchema,
  getLookResponseSchema,
  listLooksRequestSchema,
  listLooksResponseSchema,
  lookIdSchema,
} from "./api-contract.ts";

const look = {
  id: "seed-sunday-coat",
  userId: "editorial",
  title: "Sunday Coat",
  caption: "",
  creator: "Maya Chen",
  imageSrc: "/looks/sunday-coat.jpg",
  createdAt: 1,
  updatedAt: 1,
  tags: [],
};

describe("looks API contracts", () => {
  it("accepts requests for the feed and valid seeded or UUID look ids", () => {
    assert.deepEqual(listLooksRequestSchema.parse({}), {});
    assert.equal(getLookRequestSchema.parse({ id: look.id }).id, look.id);
    assert.equal(lookIdSchema.parse("c7f779b6-2e6a-4fb9-96a1-bdb3e71652f2"), "c7f779b6-2e6a-4fb9-96a1-bdb3e71652f2");
  });

  it("rejects malformed look ids", () => {
    assert.equal(lookIdSchema.safeParse("").success, false);
    assert.equal(lookIdSchema.safeParse("../private").success, false);
    assert.equal(lookIdSchema.safeParse("x".repeat(129)).success, false);
  });

  it("validates the feed and detail response shapes", () => {
    assert.deepEqual(listLooksResponseSchema.parse([look]), [look]);
    assert.deepEqual(getLookResponseSchema.parse(look), look);
    assert.equal(listLooksResponseSchema.safeParse([{ ...look, title: 1 }]).success, false);
  });
});
