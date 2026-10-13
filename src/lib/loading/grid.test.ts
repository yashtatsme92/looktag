import assert from "node:assert/strict";
import { test } from "node:test";
import { getSkeletonGridColumns } from "./grid.ts";

test("skeleton grid column breakpoints match phone, tablet, and desktop", () => {
  for (const [width, columns] of [
    [390, 2],
    [834, 2],
    [1024, 3],
    [1194, 3],
    [1279, 3],
    [1280, 4],
    [1440, 4],
  ] as const) {
    assert.equal(getSkeletonGridColumns(width), columns, `${width}px viewport`);
  }
});
