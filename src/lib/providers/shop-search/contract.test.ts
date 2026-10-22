import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { search as braveSearch } from "./brave.ts";
import { search as googleSearch } from "./google-cse.ts";
import { resolveShopSearchProvider, search } from "./index.ts";

const region = { id: "DE", name: "Germany" };

describe("shop search provider", () => {
  it("defaults to brave and returns no hits without credentials", async () => {
    assert.equal(resolveShopSearchProvider({}), "brave");
    assert.equal(resolveShopSearchProvider({ SHOP_SEARCH_PROVIDER: "google-cse" }), "google-cse");
    assert.equal(resolveShopSearchProvider({ SHOP_SEARCH_PROVIDER: "duckduckgo" }), "duckduckgo");
    assert.throws(
      () => resolveShopSearchProvider({ SHOP_SEARCH_PROVIDER: "bing" }),
      /Unknown SHOP_SEARCH_PROVIDER "bing"\. Expected brave\|google-cse\|duckduckgo\./,
    );
    assert.deepEqual(await braveSearch("coat", region, ["zalando.de"], ""), []);
    assert.deepEqual(await googleSearch("coat", region, ["zalando.de"], "", ""), []);
    assert.deepEqual(await search("coat", region, ["zalando.de"], {}), []);
  });
});
