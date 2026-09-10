import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  comparedCount,
  DEFAULT_RANK_WEIGHTS,
  pinCount,
  rankLooks,
  rankScore,
} from "./rank.ts";
import type { Look, ProductTag } from "./types.ts";

function tag(id: string, offers: number): ProductTag {
  return {
    id,
    x: 40,
    y: 40,
    name: id,
    brand: "",
    price: "10",
    currency: "EUR",
    url: "https://www.zalando.de/item",
    retailerId: "zalando",
    offers: Array.from({ length: offers }, (_, i) => ({
      id: `${id}-${i}`,
      retailerId: i === 0 ? "zalando" : "zara",
      price: String(10 + i),
      currency: "EUR",
      url: "https://www.zalando.de/item",
    })),
    wornUrl: "https://www.zalando.de/item",
    wornRetailerId: "zalando",
  };
}

function look(id: string, tags: ProductTag[]): Look {
  return {
    id,
    userId: "u",
    title: id,
    caption: "",
    creator: "You",
    imageSrc: "/looks/sunday-coat.jpg",
    createdAt: 1,
    updatedAt: 1,
    tags,
  };
}

describe("rankScore", () => {
  it("uses 12 / 3 / 5 by default", () => {
    assert.deepEqual(DEFAULT_RANK_WEIGHTS, { look: 12, pin: 3, compared: 5 });
    assert.equal(rankScore(1, 2, 1), 12 + 6 + 5);
    assert.equal(rankScore(1, 2, 1, { look: 15, pin: 4, compared: 5 }), 15 + 8 + 5);
  });
});

describe("pin and compared counts", () => {
  it("counts pins and pieces with two or more offers", () => {
    const tags = [tag("coat", 2), tag("boot", 1)];
    assert.equal(pinCount(tags), 2);
    assert.equal(comparedCount(tags), 1);
  });
});

describe("rankLooks", () => {
  it("orders by score then pin count", () => {
    const ranked = rankLooks([
      look("quiet", [tag("a", 1)]),
      look("busy", [tag("a", 2), tag("b", 2), tag("c", 1)]),
    ]);
    assert.equal(ranked[0].look.id, "busy");
    assert.ok(ranked[0].score > ranked[1].score);
  });
});
