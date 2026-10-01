import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inAppHistoryIndex, leaveEditMode, markEditOpenedFromLook, shouldUseHistoryBack } from "./back.ts";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("in-app back", () => {
  it("reads the router history index", () => {
    assert.equal(inAppHistoryIndex({ __TSR_index: 2 }), 2);
    assert.equal(inAppHistoryIndex({ __TSR_index: 0 }), 0);
    assert.equal(inAppHistoryIndex(null), null);
    assert.equal(inAppHistoryIndex({}), null);
  });

  it("uses history only after an in-app step", () => {
    assert.equal(shouldUseHistoryBack({ __TSR_index: 1 }), true);
    assert.equal(shouldUseHistoryBack({ __TSR_index: 0 }), false);
  });

  it("does not treat an outside referrer as an in-app back", () => {
    assert.equal(shouldUseHistoryBack(null), false);
    assert.equal(shouldUseHistoryBack({ url: "https://example.com" }), false);
  });

  it("pops back to the look instead of stacking another view", () => {
    const store = memory();
    markEditOpenedFromLook("look-1", store);
    assert.equal(leaveEditMode({ __TSR_index: 1 }, "look-1", store), "back");
    assert.equal(leaveEditMode({ __TSR_index: 1 }, "look-1", store), "replace");
  });

  it("replaces a direct edit visit so Back cannot return to the editor", () => {
    const store = memory();
    markEditOpenedFromLook("look-1", store);
    assert.equal(leaveEditMode({ __TSR_index: 0 }, "look-1", store), "replace");
    assert.equal(leaveEditMode({ __TSR_index: 2 }, "look-1", store), "replace");
  });
});
