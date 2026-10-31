import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, lookCurrency, lookPriceBand, lookTotal, parsePrice } from "./format.ts";

describe("parsePrice", () => {
  it("reads plain and locale numbers", () => {
    assert.equal(parsePrice("129"), 129);
    assert.equal(parsePrice("€89.00"), 89);
    assert.equal(parsePrice(""), 0);
  });
});

describe("formatMoney", () => {
  it("formats euros without cents when whole", () => {
    assert.match(formatMoney("120", "EUR"), /120/);
    assert.equal(formatMoney("", "EUR"), "—");
  });
});

describe("look totals", () => {
  it("sums the as-worn or first offer on each pin", () => {
    const tags = [
      {
        price: "200",
        currency: "EUR",
        wornUrl: "https://worn.example/coat",
        offers: [
          { price: "90", currency: "EUR", url: "https://shop.example/low" },
          { price: "180", currency: "EUR", url: "https://worn.example/coat" },
        ],
      },
      { price: "40", currency: "EUR", offers: [{ price: "40", currency: "EUR" }] },
    ];
    assert.equal(lookTotal(tags), 220);
    assert.equal(lookCurrency(tags), "EUR");
    assert.equal(lookPriceBand(tags), "€100–€250");
  });

  it("returns null when nothing is priced", () => {
    assert.equal(lookPriceBand([{ price: "", currency: "EUR" }]), null);
  });

  it("bands under €100", () => {
    assert.equal(
      lookPriceBand([{ price: "40", currency: "EUR", offers: [{ price: "40", currency: "EUR" }] }]),
      "under €100",
    );
  });
});
