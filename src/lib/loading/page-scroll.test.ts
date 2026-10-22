import assert from "node:assert/strict";
import { test } from "node:test";
import { usesElementScroll } from "./page-scroll.ts";

test("phone scroller is the element only when it actually scrolls", () => {
  assert.equal(usesElementScroll("auto"), true);
  assert.equal(usesElementScroll("scroll"), true);
  assert.equal(usesElementScroll("visible"), false);
  assert.equal(usesElementScroll("hidden"), false);
});
