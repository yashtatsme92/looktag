import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isProductUrl, pickSearchDomains, RETAILERS, shopPriorityScore } from "./retailers.ts";

describe("pickSearchDomains", () => {
  it("picks one host per shop, brand shops first, max 5", () => {
    const domains = pickSearchDomains(RETAILERS);
    assert.deepEqual(domains, ["zalando.de", "zara.com", "cos.com", "hm.com", "uniqlo.com"]);
  });

  it("skips shops that are not in the catalog slice", () => {
    const domains = pickSearchDomains(RETAILERS.filter((shop) => shop.id === "sezane" || shop.id === "mango"));
    assert.deepEqual(domains, ["mango.com", "sezane.com"]);
  });
});

describe("shopPriorityScore", () => {
  it("ranks brand-first catalog shops above the rest", () => {
    assert.ok(shopPriorityScore("zalando") > shopPriorityScore("zara"));
    assert.ok(shopPriorityScore("zara") > shopPriorityScore("otto"));
    assert.equal(shopPriorityScore("unknown-shop"), 0);
  });
});

describe("isProductUrl", () => {
  it("accepts live item pages and rejects category roots", () => {
    assert.equal(
      isProductUrl(
        "https://www.cos.com/en-us/women/womenswear/coatsjackets/coats/product/oversized-double-breasted-wool-coat-camel-1298577004",
      ),
      true,
    );
    assert.equal(
      isProductUrl("https://www.zara.com/uk/en/short-wool-coat-p04070023.html"),
      true,
    );
    assert.equal(isProductUrl("https://www2.hm.com/en_gb/productpage.1191473002.html"), true);
    assert.equal(
      isProductUrl("https://en.zalando.de/maxandco-cactus-classic-coat-kamel-mq921u099-b11.html"),
      true,
    );
    assert.equal(isProductUrl("https://www.zara.com/de/de/damen-maentel-camel-l1839.html"), false);
    assert.equal(isProductUrl("https://www.cos.com/en-ww/women/coats-and-jackets/wool-coats"), false);
    assert.equal(isProductUrl("https://www.zalando.de/"), false);
  });
});
