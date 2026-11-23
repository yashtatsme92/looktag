import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeSavedLookIds,
  parseSavedLookIds,
  toggleSavedLookId,
} from "./saved-contract.ts";
import { omitSelfFollow, toggleStoredId, viewerCanFollow } from "./follows.ts";

describe("shared saved and follow contracts", () => {
  it("normalizes saved ids and preserves the existing toggle ordering", () => {
    assert.deepEqual(parseSavedLookIds('["look-a",1,"look-b"]'), ["look-a", "look-b"]);
    assert.deepEqual(parseSavedLookIds("not-json"), []);
    assert.deepEqual(mergeSavedLookIds(["look-a"], ["look-a", "look-b"]), ["look-a", "look-b"]);
    assert.deepEqual(toggleSavedLookId(["look-a"], "look-b"), ["look-b", "look-a"]);
    assert.deepEqual(toggleSavedLookId(["look-a", "look-b"], "look-a"), ["look-b"]);
  });

  it("enforces self-follow rules while preserving follow toggle semantics", () => {
    assert.equal(viewerCanFollow(undefined, "creator"), true);
    assert.equal(viewerCanFollow("creator", "creator"), false);
    assert.deepEqual(omitSelfFollow(["creator", "other"], "creator"), ["other"]);
    assert.deepEqual(toggleStoredId(["creator"], "other"), ["creator", "other"]);
  });
});
