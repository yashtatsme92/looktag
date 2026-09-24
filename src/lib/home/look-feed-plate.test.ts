import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FashionLabel } from "../labels/model.ts";
import type { Look } from "../looks/types.ts";
import { plateAttribution, plateCaptionLine, plateMetaLine } from "./look-feed-plate.ts";

function makeLook(partial?: Partial<Look>): Look {
  return {
    id: "look-1",
    userId: "label-1",
    title: "Evening look",
    caption: "",
    creator: "Maison North",
    imageSrc: "/look.jpg",
    createdAt: 0,
    updatedAt: 0,
    tags: [
      {
        id: "tag-1",
        x: 0.2,
        y: 0.2,
        name: "Dress",
        brand: "Brand A",
        price: "90",
        currency: "EUR",
        url: "https://example.com/dress",
        retailerId: "shop-1",
        offers: [{ id: "offer-1", url: "https://example.com/dress", price: "90", currency: "EUR", retailerId: "shop-1" }],
      },
      {
        id: "tag-2",
        x: 0.7,
        y: 0.7,
        name: "Shoes",
        brand: "Brand B",
        price: "65",
        currency: "EUR",
        url: "https://example.com/shoes",
        retailerId: "shop-2",
        offers: [{ id: "offer-2", url: "https://example.com/shoes", price: "65", currency: "EUR", retailerId: "shop-2" }],
      },
    ],
    ...partial,
  };
}

function makeLabel(partial?: Partial<FashionLabel>): FashionLabel {
  return {
    id: "label-1",
    name: "Maison North",
    handle: "@maisonnorth",
    bio: "",
    city: "",
    moods: [],
    scouted: true,
    status: "approved",
    createdAt: 0,
    ...partial,
  };
}

describe("plate home-card copy", () => {
  it("builds the phone caption as pieces and band", () => {
    const look = makeLook();
    assert.equal(plateCaptionLine(look), "2 pieces · €100–€250");
  });

  it("uses house attribution when available", () => {
    const look = makeLook();
    const labels = [makeLabel({ name: "House Meridian" })];
    assert.equal(plateAttribution(look, labels), "House Meridian");
    assert.equal(plateMetaLine(look, labels), "House Meridian · 2 pieces · €100–€250");
  });

  it("falls back to creator and omits caption when no tags are present", () => {
    const look = makeLook({ userId: "creator-2", creator: "Creator Name", tags: [] });
    assert.equal(plateCaptionLine(look), "");
    assert.equal(plateMetaLine(look, []), "Creator Name");
  });
});
