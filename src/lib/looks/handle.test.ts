import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptySelfProfile, makeHandle, parseHandle, suggestHandle } from "./handle.ts";

describe("makeHandle", () => {
  it("builds a stable @handle from a name and user id", () => {
    assert.equal(makeHandle("Test Creator", "userXX99ab"), "test-creator-XX99ab");
  });

  it("falls back when the name is empty", () => {
    const handle = makeHandle("   ", "abc123");
    assert.equal(handle.startsWith("creator-"), true);
  });
});

describe("suggestHandle", () => {
  it("slugs a name without a user suffix", () => {
    assert.equal(suggestHandle("Ada Lovelace"), "ada-lovelace");
  });
});

describe("parseHandle", () => {
  it("accepts a simple handle", () => {
    const parsed = parseHandle("@Ada-Looks");
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value, "ada-looks");
  });

  it("rejects reserved names", () => {
    assert.equal(parseHandle("login").ok, false);
    assert.equal(parseHandle("you").ok, false);
  });
});

describe("emptySelfProfile", () => {
  it("lets a new account open You before they publish a look", () => {
    const profile = emptySelfProfile({ userId: "user-1", displayName: "Ada", city: "Lisbon" });
    assert.equal(profile.creator.userId, "user-1");
    assert.equal(profile.creator.looks, 0);
    assert.equal(profile.looks.length, 0);
    assert.ok(profile.creator.handle.includes("ada"));
    assert.equal(profile.creator.city, "Lisbon");
    assert.equal(profile.creator.bio, "");
  });
});
