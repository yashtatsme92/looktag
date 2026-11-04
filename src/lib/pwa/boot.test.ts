import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOT_CROSSFADE_MS,
  BOOT_FEED_READY_EVENT,
  BOOT_MAX_WAIT_MS,
  BOOT_MIN_ANIMATION_MS,
  BOOT_ROUTE_READY_EVENT,
  BOOT_SKIP_KEY,
  BOOT_STATIC_FINISH_EVENT,
  isSharePath,
} from "./boot.ts";

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

describe("boot timing", () => {
  it("waits for feed readiness after one animation cycle, with a 10-second cap", () => {
    assert.equal(BOOT_MIN_ANIMATION_MS, 1250);
    assert.equal(BOOT_MAX_WAIT_MS, 10_000);
    assert.equal(BOOT_CROSSFADE_MS, 150);
    assert.equal(BOOT_FEED_READY_EVENT, "looktag:feed-ready");
    assert.equal(BOOT_ROUTE_READY_EVENT, "looktag:route-ready");
    assert.equal(BOOT_STATIC_FINISH_EVENT, "looktag:finish-boot");
    assert.equal(BOOT_SKIP_KEY, "looktag-boot-v1");
  });
});
