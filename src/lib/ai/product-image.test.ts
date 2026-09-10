import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { absolutize, extractOgImage, jsonLdImage } from "./product-image.ts";

describe("extractOgImage", () => {
  it("reads og:image in either attribute order", () => {
    const page = "https://www.zalando.de/coat.html";
    assert.equal(
      extractOgImage(
        `<meta property="og:image" content="https://img.zalando.net/coat.jpg">`,
        page,
      ),
      "https://img.zalando.net/coat.jpg",
    );
    assert.equal(
      extractOgImage(
        `<meta content="https://img.zalando.net/coat-b.jpg" property="og:image">`,
        page,
      ),
      "https://img.zalando.net/coat-b.jpg",
    );
  });

  it("resolves relative and protocol-relative urls", () => {
    assert.equal(
      extractOgImage(`<meta property="og:image" content="//cdn.example/a.jpg">`, "https://shop.example/item"),
      "https://cdn.example/a.jpg",
    );
    assert.equal(
      extractOgImage(`<meta property="og:image" content="/media/coat.jpg">`, "https://www.cos.com/en/coat"),
      "https://www.cos.com/media/coat.jpg",
    );
  });

  it("falls back to JSON-LD Product image", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","image":"https://img.cos.com/knit.jpg"}</script>`;
    assert.equal(extractOgImage(html, "https://www.cos.com/knit"), "https://img.cos.com/knit.jpg");
  });

  it("skips blank and data uris", () => {
    assert.equal(extractOgImage(`<meta property="og:image" content="">`, "https://x.test"), undefined);
    assert.equal(absolutize("data:image/gif;base64,xx", "https://x.test"), undefined);
  });
});

describe("jsonLdImage", () => {
  it("walks @graph and image objects", () => {
    assert.equal(
      jsonLdImage({
        "@graph": [{ "@type": "Product", image: { url: "https://img.test/a.jpg" } }],
      }),
      "https://img.test/a.jpg",
    );
  });
});
