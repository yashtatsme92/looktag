import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EDITORIAL_USER_ID, type Look } from "../looks/types.ts";
import {
  SCOUTED_FLAG,
  collectionPath,
  collectionSlug,
  collectionsForPublicHouses,
  groupLooksByCollection,
  isLabelUserId,
  isPublicHouse,
  labelMatchScore,
  labelsForLikings,
  likingsFromLooks,
  looksBelongToHouse,
  looksForYou,
  nextCollectionSlug,
  parseHouseStatus,
  rankLabels,
  suggestLooks,
  type FashionCollection,
  type FashionLabel,
} from "./model.ts";
import { SEED_COLLECTIONS, SEED_LABELS, SEED_LABEL_LOOKS } from "./seed.ts";

function look(partial: Partial<Look> & Pick<Look, "id" | "userId" | "title">): Look {
  return {
    caption: "",
    creator: "Creator",
    imageSrc: "/looks/sunday-coat.jpg",
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    moods: [],
    ...partial,
  };
}

const houses: FashionLabel[] = [
  {
    id: "label-a",
    name: "A",
    handle: "a",
    bio: "",
    city: "Paris",
    moods: ["evening"],
    scouted: true,
    status: "approved",
    createdAt: 1,
  },
  {
    id: "label-b",
    name: "B",
    handle: "b",
    bio: "",
    city: "Lisbon",
    moods: ["coastal"],
    scouted: false,
    status: "approved",
    createdAt: 2,
  },
];

describe("Scouted flag", () => {
  it("is the portal mark for curated houses", () => {
    assert.equal(SCOUTED_FLAG, "Scouted");
  });
});

describe("house status", () => {
  it("defaults unknown values to approved so seeded houses stay public", () => {
    assert.equal(parseHouseStatus("pending"), "pending");
    assert.equal(parseHouseStatus("rejected"), "rejected");
    assert.equal(parseHouseStatus("approved"), "approved");
    assert.equal(parseHouseStatus(null), "approved");
  });

  it("hides pending and rejected houses from public lists", () => {
    assert.equal(isPublicHouse({ status: "approved" }), true);
    assert.equal(isPublicHouse({ status: "pending" }), false);
    assert.equal(isPublicHouse({ status: "rejected" }), false);
  });

  it("counts owner looks as belonging to the house", () => {
    const label: FashionLabel = {
      id: "label-owned",
      name: "Owned",
      handle: "owned",
      bio: "",
      city: "Berlin",
      moods: [],
      scouted: false,
      status: "approved",
      ownerUserId: "creator-1",
      createdAt: 1,
    };
    assert.equal(looksBelongToHouse(look({ id: "a", userId: "label-owned", title: "A" }), label), true);
    assert.equal(looksBelongToHouse(look({ id: "b", userId: "creator-1", title: "B" }), label), true);
    assert.equal(looksBelongToHouse(look({ id: "c", userId: "other", title: "C" }), label), false);
  });
});

describe("collectionsForPublicHouses", () => {
  it("excludes collections belonging to pending houses", () => {
    const labels: FashionLabel[] = [
      {
        id: "label-live",
        name: "Live",
        handle: "live",
        bio: "",
        city: "Paris",
        moods: [],
        scouted: false,
        status: "approved",
        createdAt: 1,
      },
      {
        id: "label-pending",
        name: "Pending",
        handle: "pending",
        bio: "",
        city: "Berlin",
        moods: [],
        scouted: false,
        status: "pending",
        createdAt: 2,
      },
      {
        id: "label-rejected",
        name: "Rejected",
        handle: "rejected",
        bio: "",
        city: "Madrid",
        moods: [],
        scouted: false,
        status: "rejected",
        createdAt: 3,
      },
    ];
    const collections: FashionCollection[] = [
      {
        id: "col-live",
        labelId: "label-live",
        name: "Summer",
        slug: "summer",
        caption: "public",
        season: "SS26",
        moods: [],
        sortOrder: 0,
        createdAt: 1,
      },
      {
        id: "col-pending",
        labelId: "label-pending",
        name: "Secret Drop",
        slug: "secret-drop",
        caption: "not yet",
        season: "FW26",
        moods: [],
        sortOrder: 0,
        createdAt: 2,
      },
      {
        id: "col-rejected",
        labelId: "label-rejected",
        name: "Archive",
        slug: "archive",
        caption: "gone",
        season: "SS25",
        moods: [],
        sortOrder: 0,
        createdAt: 3,
      },
    ];
    const visible = collectionsForPublicHouses(collections, labels);
    assert.deepEqual(
      visible.map((row) => row.id),
      ["col-live"],
    );
    assert.equal(
      visible.some((row) => row.labelId === "label-pending"),
      false,
    );
  });
});

describe("isLabelUserId", () => {
  it("uses the label- prefix so houses never mix with creator rank", () => {
    assert.equal(isLabelUserId("label-atelier-noir"), true);
    assert.equal(isLabelUserId("editorial"), false);
    assert.equal(isLabelUserId("user-123"), false);
  });
});

describe("likings and match", () => {
  it("reads moods from saved looks, most frequent first", () => {
    const likings = likingsFromLooks([
      look({ id: "1", userId: "u", title: "A", moods: ["coastal", "knit"] }),
      look({ id: "2", userId: "u", title: "B", moods: ["coastal"] }),
      look({ id: "3", userId: "u", title: "C", moods: ["evening"] }),
    ]);
    assert.deepEqual(likings, ["coastal", "evening", "knit"]);
  });

  it("ranks Scouted houses first when the visitor has no likings", () => {
    const ordered = labelsForLikings(houses, []);
    assert.equal(ordered[0].id, "label-a");
    assert.ok(labelMatchScore(houses[0], []) > labelMatchScore(houses[1], []));
  });

  it("ranks houses that match saved moods above Scouted-only houses", () => {
    const ordered = labelsForLikings(houses, ["coastal"]);
    assert.equal(ordered[0].id, "label-b");
  });
});

describe("rankLabels", () => {
  it("scores houses like creators: looks, pins, compared prices", () => {
    const ranked = rankLabels(SEED_LABELS, SEED_LABEL_LOOKS);
    assert.ok(ranked.length === 4);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.equal(
      ranked.find((row) => row.label.id === "label-atelier-noir")?.looks,
      2,
    );
  });

  it("counts named collections per house", () => {
    const ranked = rankLabels(SEED_LABELS, SEED_LABEL_LOOKS);
    const noir = ranked.find((row) => row.label.id === "label-atelier-noir");
    const salt = ranked.find((row) => row.label.id === "label-salt-loom");
    assert.equal(noir?.collectionCount, 2);
    assert.equal(salt?.collectionCount, 2);
  });

  it("counts looks the house owner published", () => {
    const labels: FashionLabel[] = [
      {
        id: "label-owned",
        name: "Owned",
        handle: "owned",
        bio: "",
        city: "Berlin",
        moods: [],
        scouted: false,
        status: "approved",
        ownerUserId: "creator-1",
        createdAt: 1,
      },
    ];
    const ranked = rankLabels(labels, [
      look({ id: "house-look", userId: "label-owned", title: "House" }),
      look({ id: "owner-look", userId: "creator-1", title: "Owner", collectionId: "col-1" }),
      look({ id: "other", userId: "someone-else", title: "Other" }),
    ]);
    assert.equal(ranked[0].looks, 2);
    assert.equal(ranked[0].collectionCount, 1);
  });
});

describe("collections", () => {
  it("slugs collection names for shareable paths", () => {
    assert.equal(collectionSlug("Summer Blues"), "summer-blues");
    assert.equal(collectionSlug("Kinkistyles"), "kinkistyles");
    assert.equal(nextCollectionSlug("Summer Blues", ["summer-blues"]), "summer-blues-2");
    assert.equal(nextCollectionSlug("Summer Blues", []), "summer-blues");
    assert.equal(
      collectionPath("label-atelier-noir", { slug: "kinkistyles" }),
      "/houses/label-atelier-noir/kinkistyles",
    );
  });

  it("groups a house's looks under named collections in sort order", () => {
    const noirLooks = SEED_LABEL_LOOKS.filter((item) => item.userId === "label-atelier-noir");
    const noirCollections = SEED_COLLECTIONS.filter((item) => item.labelId === "label-atelier-noir");
    const grouped = groupLooksByCollection(noirCollections, noirLooks);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0].collection.name, "Kinkistyles");
    assert.equal(grouped[1].collection.name, "After Hours");
    assert.ok(grouped[0].looks.some((item) => item.title === "Noir Column"));
    assert.ok(grouped[1].looks.some((item) => item.title === "Pressed Coat"));
  });

  it("keeps ungrouped looks in a Looks bucket", () => {
    const collections: FashionCollection[] = [
      {
        id: "col-a",
        labelId: "label-a",
        name: "Summer Blues",
        slug: "summer-blues",
        caption: "",
        season: "SS26",
        moods: [],
        sortOrder: 0,
        createdAt: 1,
      },
    ];
    const grouped = groupLooksByCollection(collections, [
      look({ id: "in", userId: "label-a", title: "In", collectionId: "col-a" }),
      look({ id: "out", userId: "label-a", title: "Out" }),
    ]);
    assert.equal(grouped[0].collection.name, "Summer Blues");
    assert.equal(grouped[1].collection.name, "Looks");
    assert.equal(grouped[1].looks[0].id, "out");
  });
});

describe("suggestLooks", () => {
  it("interleaves influencer looks with house collections", () => {
    const influencer = look({
      id: "inf-1",
      userId: "creator-1",
      title: "City Knit",
      moods: ["knit"],
    });
    const editorial = look({
      id: "ed-1",
      userId: EDITORIAL_USER_ID,
      title: "House plate",
      moods: ["tailored"],
    });
    const mixed = suggestLooks({
      looks: [...SEED_LABEL_LOOKS, influencer, editorial],
      labels: SEED_LABELS,
      likings: ["knit"],
      limit: 4,
    });
    const sources = new Set(mixed.map((row) => row.source));
    assert.ok(sources.has("house"));
    assert.ok(sources.has("influencer"));
    assert.equal(mixed.some((row) => row.look.userId === EDITORIAL_USER_ID), false);
    assert.ok(mixed.length <= 4);
  });
});

describe("looksForYou", () => {
  it("falls back to non-editorial looks when nothing is suggested", () => {
    const rows = looksForYou(
      [look({ id: "x", userId: "creator-1", title: "Open" })],
      [],
      [],
    );
    assert.equal(rows.length, 1);
  });
});
