import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOT_HOLD_MS, BOOT_SKIP_KEY, isSharePath } from "./boot.ts";

describe("isSharePath", () => {
  it("skips the opening splash on look, house, and collection permalinks", () => {
    assert.equal(isSharePath("/looks/seed-sunday-coat"), true);
    assert.equal(isSharePath("/houses/label-atelier-noir"), true);
    assert.equal(isSharePath("/houses/label-atelier-noir/kinkistyles"), true);
  });

  it("plays the splash on app chrome routes", () => {
    assert.equal(isSharePath("/"), false);
    assert.equal(isSharePath("/create"), false);
    assert.equal(isSharePath("/login"), false);
    assert.equal(isSharePath("/rank"), false);
    assert.equal(isSharePath("/houses"), false);
    assert.equal(isSharePath("/looks"), false);
    assert.equal(isSharePath("/admin/studio"), false);
  });
});

describe("boot hold", () => {
  it("holds the plate long enough to read, then lets the session skip a replay", () => {
    assert.equal(BOOT_HOLD_MS, 2000);
    assert.equal(BOOT_SKIP_KEY, "looktag-boot-v1");
  });
});
