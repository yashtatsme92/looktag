import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reweightLooks, type MoreLikeSeed } from "./more-like-this.ts";
import type { Look } from "./types.ts";

function look(id: string, moods: string[], title = id): Look {
  return {
    id,
    userId: "editorial",
    title,
    caption: "",
    creator: "Looktag",
    imageSrc: "",
    moods,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("more-like-this reweight", () => {
  it("orders overlapping moods ahead of unrelated looks", () => {
    const seed: MoreLikeSeed = { lookId: "seed", moods: ["tailored"], title: "Seed" };
    const ordered = reweightLooks(
      [
        look("a", ["coastal"]),
        look("b", ["tailored"]),
        look("c", ["tailored", "evening"]),
        look("seed", ["tailored"]),
      ],
      seed,
    );
    // Equal tailored overlap → title order (b before c); coastal last; seed deprioritized
    assert.deepEqual(
      ordered.map((item) => item.id),
      ["b", "c", "a", "seed"],
    );
  });

  it("deprioritizes the seed look so next slots feel like “more”", () => {
    const seed: MoreLikeSeed = { lookId: "seed", moods: ["knit"], title: "Seed" };
    const ordered = reweightLooks([look("seed", ["knit"]), look("other", ["knit"])], seed);
    assert.equal(ordered[0]?.id, "other");
    assert.equal(ordered[1]?.id, "seed");
  });
});
