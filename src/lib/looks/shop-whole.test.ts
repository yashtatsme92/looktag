import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstShopTag, plateShowsBarShop, shopWholeOpensSheet } from "./shop-whole.ts";
import type { ProductTag } from "./types.ts";

function tag(id: string, extra: Partial<ProductTag> = {}): ProductTag {
  return { id, x: 50, y: 50, name: id, brand: "", price: "", currency: "EUR", url: "", retailerId: "", offers: [], ...extra };
}

describe("shop whole look target", () => {
  it("skips pins with no shop target and takes the first one that has one", () => {
    const tags = [
      tag("none"),
      tag("styled-no-offers", { styleId: "style-a" }),
      tag("worn", { wornUrl: "https://example.com/worn", wornRetailerId: "cos" }),
      tag("offer", { offers: [{ id: "o", url: "https://example.com/o", price: "10", currency: "EUR", retailerId: "zalando" }] }),
    ];
    const first = firstShopTag(tags);
    assert.equal(first?.tag.id, "worn");
    assert.equal(first?.url, "https://example.com/worn");
    assert.equal(first?.retailerId, "cos");
  });

  it("falls back to an offer, then the plain url", () => {
    const offer = tag("offer", { offers: [{ id: "o", url: " https://example.com/o ", price: "", currency: "EUR", retailerId: "zalando" }] });
    assert.equal(firstShopTag([tag("a"), offer])?.tag.id, "offer");
    assert.equal(firstShopTag([tag("plain", { url: "https://example.com/p", retailerId: "zara" })])?.retailerId, "zara");
  });

  it("returns nothing when no pin can be shopped, including Style-linked pins without offers", () => {
    assert.equal(firstShopTag([]), undefined);
    assert.equal(firstShopTag([tag("a", { styleId: "style-a" }), tag("b", { url: "   " })]), undefined);
  });
});

describe("shop whole look chrome", () => {
  it("hides the bar Shop control only on a phone with a pin open", () => {
    assert.equal(plateShowsBarShop(true, true), false);
    assert.equal(plateShowsBarShop(true, false), true);
    assert.equal(plateShowsBarShop(false, true), true);
    assert.equal(plateShowsBarShop(false, false), true);
  });

  it("keeps phone Shop whole look on the first retailer and opens the sheet everywhere else", () => {
    assert.equal(shopWholeOpensSheet(true), false);
    assert.equal(shopWholeOpensSheet(false), true);
  });
});
