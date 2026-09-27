import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inAppHistoryIndex, shouldUseHistoryBack } from "./back.ts";

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
});
