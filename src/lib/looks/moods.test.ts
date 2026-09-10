import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { looksForMood, moodLabel, MOODS } from "./moods.ts";
import type { Look } from "./types.ts";

function look(id: string, moods: string[]): Look {
  return {
    id,
    userId: "u",
    title: id,
    caption: "",
    creator: "You",
    imageSrc: "/looks/sunday-coat.jpg",
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    moods,
  };
}

describe("moods", () => {
  it("lists the four feed styles", () => {
    assert.deepEqual(
      MOODS.map((mood) => mood.id),
      ["tailored", "evening", "knit", "coastal"],
    );
    assert.equal(moodLabel("coastal"), "Coastal");
    assert.equal(moodLabel("unknown"), "unknown");
  });

  it("filters looks by mood and returns the full feed when none is picked", () => {
    const looks = [
      look("coat", ["tailored", "evening"]),
      look("linen", ["coastal"]),
      look("knit", ["knit"]),
    ];
    assert.equal(looksForMood(looks, null).length, 3);
    assert.deepEqual(
      looksForMood(looks, "coastal").map((row) => row.id),
      ["linen"],
    );
    assert.deepEqual(
      looksForMood(looks, "tailored").map((row) => row.id),
      ["coat"],
    );
    assert.equal(looksForMood(looks, "evening").length, 1);
  });
});
