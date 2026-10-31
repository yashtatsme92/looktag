import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shopTarget, sortOffers, syncTag } from "./offers.ts";
import { emptyTag, type ProductOffer } from "./types.ts";

function offer(id: string, price: string, url: string, retailerId = "shop"): ProductOffer {
  return { id, price, url, currency: "EUR", retailerId };
}

describe("shopTarget", () => {
  it("prefers the as-worn link, then the first offer, regardless of price", () => {
    const worn = emptyTag(0, 0);
    worn.wornUrl = "https://worn.example/a";
    worn.wornRetailerId = "worn";
    worn.offers = [
      offer("low", "10", "https://shop.example/low", "low"),
      offer("high", "90", "https://shop.example/high", "high"),
    ];
    assert.deepEqual(shopTarget(worn), { url: "https://worn.example/a", retailerId: "worn" });

    const first = emptyTag(0, 0);
    first.offers = [
      offer("high", "90", "https://shop.example/high", "high"),
      offer("low", "10", "https://shop.example/low", "low"),
    ];
    assert.deepEqual(shopTarget(first), { url: "https://shop.example/high", retailerId: "high" });

    const link = emptyTag(0, 0);
    link.url = "https://tag.example/page";
    link.retailerId = "tag";
    assert.deepEqual(shopTarget(link), { url: "https://tag.example/page", retailerId: "tag" });
  });
});

describe("sortOffers", () => {
  it("keeps creator order and puts the as-worn offer first", () => {
    const offers = [
      offer("a", "30", "https://a.example"),
      offer("b", "10", "https://b.example"),
      offer("c", "20", "https://c.example"),
    ];
    assert.deepEqual(sortOffers(offers, "default").map((row) => row.id), ["a", "b", "c"]);
    assert.deepEqual(
      sortOffers(offers, "default", "https://c.example").map((row) => row.id),
      ["c", "a", "b"],
    );
  });

  it("sorts by price and leaves unpriced offers last", () => {
    const offers = [
      offer("mid", "20", "https://m.example"),
      offer("none", "", "https://n.example"),
      offer("low", "5", "https://l.example"),
      offer("high", "40", "https://h.example"),
    ];
    assert.deepEqual(sortOffers(offers, "price-asc").map((row) => row.id), ["low", "mid", "high", "none"]);
    assert.deepEqual(sortOffers(offers, "price-desc").map((row) => row.id), ["high", "mid", "low", "none"]);
  });
});

describe("syncTag", () => {
  it("keeps the as-worn offer when a smaller price is listed first", () => {
    const worn = emptyTag(0, 0);
    worn.wornUrl = "https://worn.example/coat";
    worn.wornRetailerId = "cos";
    worn.offers = [
      offer("zal", "40", "https://shop.example/zal", "zalando"),
      offer("cos", "200", "https://worn.example/coat", "cos"),
    ];
    const synced = syncTag(worn);
    assert.equal(synced.url, "https://worn.example/coat");
    assert.equal(synced.price, "200");
    assert.equal(synced.currency, "EUR");
    assert.equal(synced.retailerId, "cos");

    const first = syncTag({
      ...emptyTag(0, 0),
      offers: [
        offer("high", "80", "https://shop.example/high", "a"),
        offer("low", "15", "https://shop.example/low", "b"),
      ],
    });
    assert.equal(first.url, "https://shop.example/high");
    assert.equal(first.price, "80");
    assert.equal(first.retailerId, "a");
  });
});
