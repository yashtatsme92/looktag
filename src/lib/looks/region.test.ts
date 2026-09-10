import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RETAILERS } from "./retailers.ts";
import {
  localizeProductUrl,
  preferredHost,
  resolveRegion,
  shopServesRegion,
  urlMatchesRegion,
} from "./region.ts";
import { pickSearchDomains } from "./retailers.ts";

describe("resolveRegion", () => {
  it("defaults to Germany", () => {
    assert.equal(resolveRegion(undefined).id, "DE");
    assert.equal(resolveRegion("xx").currency, "EUR");
  });
});

describe("preferredHost", () => {
  it("picks the Zalando TLD for the catalog country", () => {
    const zalando = RETAILERS.find((shop) => shop.id === "zalando")!;
    assert.equal(preferredHost(zalando, "DE"), "zalando.de");
    assert.equal(preferredHost(zalando, "GB"), "zalando.co.uk");
    assert.equal(preferredHost(zalando, "FR"), "zalando.fr");
  });
});

describe("shopServesRegion", () => {
  it("keeps US shops off European search", () => {
    assert.equal(shopServesRegion("nordstrom", "DE"), false);
    assert.equal(shopServesRegion("nordstrom", "US"), true);
    assert.equal(shopServesRegion("otto", "US"), false);
    assert.equal(shopServesRegion("zara", "DE"), true);
  });
});

describe("localizeProductUrl", () => {
  it("moves Zalando to the catalog TLD", () => {
    assert.equal(
      localizeProductUrl(
        "https://www.zalando.co.uk/weekday-oversized-classic-coat-dark-brown-web21u048-o11.html",
        "DE",
      ),
      "https://www.zalando.de/weekday-oversized-classic-coat-dark-brown-web21u048-o11.html",
    );
  });

  it("rewrites Zara, H&M, COS and Uniqlo locale paths", () => {
    assert.equal(
      localizeProductUrl("https://www.zara.com/us/en/short-wool-coat-p04070023.html", "DE"),
      "https://www.zara.com/de/de/short-wool-coat-p04070023.html",
    );
    assert.equal(
      localizeProductUrl("https://www2.hm.com/en_gb/productpage.1191473002.html", "DE"),
      "https://www2.hm.com/de_de/productpage.1191473002.html",
    );
    assert.equal(
      localizeProductUrl(
        "https://www.cos.com/en-us/women/womenswear/coatsjackets/coats/product/oversized-double-breasted-wool-coat-camel-1298577004",
        "DE",
      ),
      "https://www.cos.com/en-de/women/womenswear/coatsjackets/coats/product/oversized-double-breasted-wool-coat-camel-1298577004",
    );
    assert.equal(
      localizeProductUrl("https://www.uniqlo.com/us/en/products/E123456-000", "DE"),
      "https://www.uniqlo.com/de/de/products/E123456-000",
    );
  });

  it("rewrites to UK when the catalog is GB", () => {
    assert.equal(
      localizeProductUrl("https://www.zara.com/de/de/short-wool-coat-p04070023.html", "GB"),
      "https://www.zara.com/gb/en/short-wool-coat-p04070023.html",
    );
  });
});

describe("urlMatchesRegion", () => {
  it("accepts localized DE pages and rejects leftover US storefronts", () => {
    assert.equal(
      urlMatchesRegion("https://www.zalando.de/weekday-oversized-classic-coat-dark-brown-web21u048-o11.html", "DE"),
      true,
    );
    assert.equal(
      urlMatchesRegion("https://www.zalando.co.uk/weekday-oversized-classic-coat-dark-brown-web21u048-o11.html", "DE"),
      false,
    );
    assert.equal(urlMatchesRegion("https://www.nordstrom.com/s/coat/123", "DE"), false);
  });
});

describe("pickSearchDomains region", () => {
  it("uses the German Zalando host by default", () => {
    assert.deepEqual(pickSearchDomains(RETAILERS), [
      "zalando.de",
      "zara.com",
      "cos.com",
      "hm.com",
      "uniqlo.com",
    ]);
  });

  it("switches Zalando when the catalog country is GB", () => {
    const domains = pickSearchDomains(RETAILERS, "GB");
    assert.equal(domains[0], "zalando.co.uk");
  });
});
