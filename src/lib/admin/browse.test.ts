import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  browseHouses,
  browseShops,
  houseAwesomeness,
  matchesQuery,
  pageWindow,
  paginate,
  queryMatchBoost,
  shopAwesomeness,
  shopPinCounts,
  suggestHouses,
  suggestShops,
  STUDIO_HOUSE_FILTERS,
  STUDIO_HOUSE_SORTS,
  type HouseBrowseItem,
  type ShopBrowseItem,
} from "./browse.ts";

function house(partial: Partial<HouseBrowseItem> & Pick<HouseBrowseItem, "id" | "name">): HouseBrowseItem {
  return {
    handle: partial.handle ?? partial.name.toLowerCase(),
    bio: "",
    city: "Paris",
    moods: [],
    scouted: false,
    status: "approved",
    createdAt: 1,
    looks: 0,
    pins: 0,
    score: 0,
    ...partial,
  };
}

function shop(partial: Partial<ShopBrowseItem> & Pick<ShopBrowseItem, "id" | "name">): ShopBrowseItem {
  return {
    domains: [`${partial.id}.com`],
    enabled: true,
    custom: false,
    pins: 0,
    ...partial,
  };
}

describe("paginate", () => {
  it("slices a long list and clamps the page", () => {
    const rows = Array.from({ length: 20 }, (_, i) => i + 1);
    const first = paginate(rows, 1, 12);
    assert.deepEqual(first.items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(first.pages, 2);
    assert.equal(first.from, 1);
    assert.equal(first.to, 12);
    const last = paginate(rows, 99, 12);
    assert.equal(last.page, 2);
    assert.deepEqual(last.items, [13, 14, 15, 16, 17, 18, 19, 20]);
    assert.equal(last.from, 13);
    assert.equal(last.to, 20);
  });
});

describe("studio house browse", () => {
  it("only offers All and Scouted — pending houses live on the applications page", () => {
    assert.deepEqual(
      STUDIO_HOUSE_FILTERS.map((item) => item.id),
      ["all", "scouted"],
    );
    assert.equal(
      STUDIO_HOUSE_SORTS.some((item) => item.id === "status"),
      false,
    );
  });
});

describe("pageWindow", () => {
  it("lists every page when the set is short", () => {
    assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4]);
  });

  it("keeps edges and the current window on long lists", () => {
    assert.deepEqual(pageWindow(8, 20), [1, "gap", 7, 8, 9, "gap", 20]);
  });
});

describe("matchesQuery", () => {
  it("requires every token", () => {
    assert.equal(matchesQuery("salt copen", ["Salt & Loom", "saltloom", "Copenhagen"]), true);
    assert.equal(matchesQuery("salt madrid", ["Salt & Loom", "Copenhagen"]), false);
  });
});

describe("houses browse", () => {
  const houses = [
    house({ id: "a", name: "Atelier Noir", score: 43, scouted: true, looks: 2, handle: "ateliernoir" }),
    house({ id: "b", name: "Salt & Loom", score: 12, city: "Copenhagen", handle: "saltloom" }),
    house({ id: "c", name: "E2E Lab", score: 0, status: "pending", createdAt: 9, handle: "e2elab" }),
    house({ id: "d", name: "Old House", score: 4, status: "rejected", handle: "oldhouse" }),
  ];

  it("ranks Scouted high-score houses as more awesome", () => {
    assert.ok(houseAwesomeness(houses[0]) > houseAwesomeness(houses[1]));
    assert.ok(houseAwesomeness(houses[2]) > houseAwesomeness(houses[3]));
  });

  it("filters by name and city, then paginates", () => {
    const page = browseHouses(houses, "copenhagen", "name", 1);
    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, "b");
  });

  it("filters by status", () => {
    const waiting = browseHouses(houses, "", "newest", 1, "pending");
    assert.equal(waiting.total, 1);
    assert.equal(waiting.items[0].id, "c");
  });

  it("suggests the strongest live houses when the query is empty", () => {
    const suggested = suggestHouses(houses, "");
    assert.equal(suggested[0].id, "a");
    assert.equal(suggested.some((row) => row.status === "rejected"), false);
  });

  it("suggests matches while typing and boosts name hits", () => {
    const suggested = suggestHouses(houses, "lab");
    assert.equal(suggested.length, 1);
    assert.equal(suggested[0].id, "c");
    assert.ok(queryMatchBoost("atelier", "Atelier Noir") > queryMatchBoost("atelier", "Salt & Loom"));
  });
});

describe("shops browse", () => {
  const shops = [
    shop({ id: "zalando", name: "Zalando", pins: 4 }),
    shop({ id: "zara", name: "Zara", pins: 1 }),
    shop({ id: "otto", name: "Otto", pins: 0, enabled: false }),
    shop({ id: "cos", name: "COS", pins: 6 }),
  ];

  it("scores pin volume and catalog priority", () => {
    assert.ok(shopAwesomeness(shops[3]) > shopAwesomeness(shops[2]));
    assert.ok(shopAwesomeness(shops[0]) > shopAwesomeness(shops[2]));
  });

  it("filters by domain and paginates", () => {
    const page = browseShops(shops, "zara.com", "name", 1);
    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, "zara");
  });

  it("filters shops that are off", () => {
    const page = browseShops(shops, "", "name", 1, "off");
    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, "otto");
  });

  it("suggests the strongest shops first", () => {
    const suggested = suggestShops(shops, "");
    assert.equal(suggested[0].id, "cos");
    assert.ok(suggested.some((row) => row.id === "zalando"));
  });

  it("boosts a typed shop name over pin rank", () => {
    const suggested = suggestShops(shops, "zara");
    assert.equal(suggested[0].id, "zara");
  });
});

describe("shopPinCounts", () => {
  it("counts a shop once per pin even with several offers", () => {
    const counts = shopPinCounts([
      {
        tags: [
          {
            retailerId: "cos",
            offers: [{ retailerId: "cos" }, { retailerId: "zalando" }],
          },
          { retailerId: "zalando" },
        ],
      },
    ]);
    assert.equal(counts.get("cos"), 1);
    assert.equal(counts.get("zalando"), 2);
  });
});
