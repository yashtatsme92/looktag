import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  absoluteUrl,
  collectionShareMeta,
  houseShareMeta,
  isCrawler,
  isSharePath,
  lookShareMeta,
  originFromRequestLike,
  shareCacheHeaders,
  shareHead,
  shareKindFromPath,
  surfaceFromUserAgent,
} from "./share-meta.ts";

describe("isSharePath", () => {
  it("treats look, house, and collection profiles as anonymous share pages", () => {
    assert.equal(isSharePath("/looks/seed-sunday-coat"), true);
    assert.equal(isSharePath("/houses/label-atelier-noir"), true);
    assert.equal(isSharePath("/houses/label-atelier-noir/kinkistyles"), true);
    assert.equal(isSharePath("/looks/seed-sunday-coat/edit"), false);
    assert.equal(isSharePath("/houses"), false);
    assert.equal(isSharePath("/"), false);
  });
});

describe("shareKindFromPath", () => {
  it("names look, house, and collection permalinks", () => {
    assert.equal(shareKindFromPath("/looks/seed-sunday-coat"), "look");
    assert.equal(shareKindFromPath("/houses/label-atelier-noir"), "house");
    assert.equal(shareKindFromPath("/houses/label-atelier-noir/kinkistyles"), "collection");
    assert.equal(shareKindFromPath("/"), "app");
  });
});

describe("absoluteUrl", () => {
  it("prefixes a host onto in-app paths", () => {
    assert.equal(absoluteUrl("/looks/a", "https://looktag.example"), "https://looktag.example/looks/a");
    assert.equal(absoluteUrl("https://cdn.test/x.jpg", "https://looktag.example"), "https://cdn.test/x.jpg");
  });
});

describe("originFromRequestLike", () => {
  it("prefers forwarded host and proto so any reverse proxy works", () => {
    const headers = new Headers({
      host: "127.0.0.1:8080",
      "x-forwarded-host": "looktag.example",
      "x-forwarded-proto": "https",
    });
    assert.equal(
      originFromRequestLike({ url: "http://127.0.0.1:8080/looks/a", headers }),
      "https://looktag.example",
    );
  });
});

describe("isCrawler", () => {
  it("recognises link unfurlers and search bots", () => {
    assert.equal(isCrawler("Twitterbot/1.0"), true);
    assert.equal(isCrawler("facebookexternalhit/1.1"), true);
    assert.equal(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), false);
  });
});

describe("surfaceFromUserAgent", () => {
  it("labels crawlers, phones, and desktop browsers", () => {
    assert.equal(surfaceFromUserAgent("Twitterbot/1.0"), "crawler");
    assert.equal(surfaceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "native");
    assert.equal(
      surfaceFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120"),
      "web",
    );
    assert.equal(surfaceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "web");
  });
});

describe("shareCacheHeaders", () => {
  it("makes found share pages public and missing ones private", () => {
    assert.equal(shareCacheHeaders(true)["Cache-Control"]?.includes("public"), true);
    assert.equal(shareCacheHeaders(false)["X-Robots-Tag"], "noindex");
  });
});

describe("lookShareMeta", () => {
  it("builds a crawler title, canonical, Open Graph, and JSON-LD for a look", () => {
    const meta = lookShareMeta(
      {
        id: "seed-sunday-coat",
        userId: "editorial",
        title: "Sunday Coat",
        caption: "Camel wool, cream knit.",
        creator: "Maya Chen",
        imageSrc: "/looks/sunday-coat.jpg",
        createdAt: 1,
        updatedAt: 1,
        tags: [
          {
            id: "coat",
            x: 50,
            y: 40,
            name: "Camel Coat",
            brand: "COS",
            price: "279",
            currency: "EUR",
            url: "https://www.cos.com/coat",
            retailerId: "cos",
          },
        ],
      },
      "https://looktag.example",
    );
    assert.equal(meta.title, "Sunday Coat — Looktag");
    assert.match(meta.description, /Camel wool/);
    assert.equal(meta.canonical, "https://looktag.example/looks/seed-sunday-coat");
    assert.equal(meta.image, "https://looktag.example/looks/sunday-coat.jpg");
    assert.equal(meta.jsonLd["@type"], "ItemPage");
    const head = shareHead(meta);
    const ogImage = head.meta.find((row) => "property" in row && row.property === "og:image");
    assert.equal(ogImage?.content, meta.image);
    assert.ok(head.meta.some((row) => "name" in row && row.name === "looktag:share"));
  });
});

describe("houseShareMeta", () => {
  it("marks Scouted houses in the share title and uses a collection image", () => {
    const meta = houseShareMeta(
      {
        id: "label-atelier-noir",
        name: "Atelier Noir",
        handle: "ateliernoir",
        bio: "Evening tailoring.",
        city: "Paris",
        moods: ["evening"],
        scouted: true,
        status: "approved",
        createdAt: 1,
      },
      "https://looktag.example",
      "/looks/gallery-hour.jpg",
    );
    assert.equal(meta.title, "Atelier Noir — Scouted on Looktag");
    assert.equal(meta.canonical, "https://looktag.example/houses/label-atelier-noir");
    assert.equal(meta.image, "https://looktag.example/looks/gallery-hour.jpg");
    assert.equal(meta.jsonLd["@type"], "Brand");
  });
});

describe("collectionShareMeta", () => {
  it("builds a CollectionPage permalink under the house", () => {
    const meta = collectionShareMeta(
      {
        id: "label-atelier-noir",
        name: "Atelier Noir",
        handle: "ateliernoir",
        bio: "Evening tailoring.",
        city: "Paris",
        moods: ["evening"],
        scouted: true,
        status: "approved",
        createdAt: 1,
      },
      {
        id: "col-noir-kinkistyles",
        labelId: "label-atelier-noir",
        name: "Kinkistyles",
        slug: "kinkistyles",
        caption: "Sculptural black.",
        season: "Capsule",
        moods: ["evening"],
        sortOrder: 0,
        createdAt: 1,
      },
      "https://looktag.example",
      "/looks/gallery-hour.jpg",
    );
    assert.equal(meta.title, "Kinkistyles — Atelier Noir");
    assert.equal(meta.canonical, "https://looktag.example/houses/label-atelier-noir/kinkistyles");
    assert.equal(meta.kind, "collection");
    assert.equal(meta.jsonLd["@type"], "CollectionPage");
    const head = shareHead(meta);
    const ogType = head.meta.find((row) => "property" in row && row.property === "og:type");
    assert.equal(ogType?.content, "website");
  });
});

