import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_COLLECTIONS, SEED_LABELS, SEED_STYLES } from "../labels/seed.ts";
import type { Look } from "../looks/types.ts";
import {
  DEFAULT_INTERLEAVE,
  berlinWeekKey,
  feedFeatureStatus,
  feedModulesNote,
  feedSwitchCopy,
  followingHouseCards,
  followingLooks,
  freshDivider,
  freshFirst,
  pickWeeklyDrop,
  pushTrail,
  refineLane,
  styleCardAfterDrop,
} from "./engagement.ts";

function look(partial: Partial<Look> & Pick<Look, "id">): Look {
  return {
    userId: "maya",
    title: partial.id,
    caption: "",
    creator: "Maya",
    imageSrc: "/look.jpg",
    createdAt: 0,
    updatedAt: 0,
    tags: [],
    ...partial,
  };
}

describe("feed engagement", () => {
  it("boosts fresh looks without dropping the rest", () => {
    const now = Date.parse("2026-10-06T12:00:00Z");
    const ordered = freshFirst(
      [
        look({ id: "old", createdAt: now - 10 * 86400000 }),
        look({ id: "new", createdAt: now - 86400000 }),
      ],
      now,
    );
    assert.deepEqual(
      ordered.map((item) => item.id),
      ["new", "old"],
    );
    assert.equal(freshDivider({ signedIn: false, returning: true, freshCount: 1 }), null);
    assert.equal(freshDivider({ signedIn: true, returning: true, freshCount: 1 }), "New since your last visit");
  });

  it("reweights an Echo lane and keeps every look", () => {
    const lane = [
      look({ id: "a", moods: ["knit"] }),
      look({ id: "b", moods: ["evening"] }),
    ];
    assert.deepEqual(
      refineLane(lane, "Darker").map((item) => item.id),
      ["b", "a"],
    );
    assert.equal(refineLane(lane, "Darker").length, 2);
    assert.deepEqual(pushTrail(["Darker"], "Lighter"), ["Darker", "Lighter"]);
    assert.equal(pushTrail(["1", "2", "3", "4"], "Darker").length, 4);
  });

  it("lists followed creators newest first", () => {
    const rows = followingLooks(
      [
        look({ id: "a", userId: "maya", createdAt: 1 }),
        look({ id: "b", userId: "else", createdAt: 9 }),
        look({ id: "c", userId: "maya", createdAt: 5 }),
      ],
      ["maya"],
    );
    assert.deepEqual(
      rows.map((item) => item.id),
      ["c", "a"],
    );
  });

  it("picks one Scouted Line for the Berlin week", () => {
    const monday = Date.parse("2026-10-05T00:30:00Z");
    const sunday = Date.parse("2026-10-11T21:30:00Z");
    assert.equal(berlinWeekKey(monday), berlinWeekKey(sunday));
    const drop = pickWeeklyDrop(SEED_LABELS, SEED_COLLECTIONS, SEED_STYLES, monday);
    assert.ok(drop);
    assert.ok(SEED_LABELS.find((label) => label.id === drop?.houseId)?.scouted);
    assert.ok(drop?.imageSrc.startsWith("/looks/"));
    const paused = SEED_LABELS.map((label) => ({ ...label, scouted: false }));
    assert.equal(pickWeeklyDrop(paused, SEED_COLLECTIONS, SEED_STYLES, monday), null);
  });

  it("keeps the Style card off the lead and away from a live drop", () => {
    assert.equal(styleCardAfterDrop(3, null), null);
    assert.equal(styleCardAfterDrop(6, null), 4);
    assert.equal(styleCardAfterDrop(6, 3), null);
    assert.equal(styleCardAfterDrop(12, 3), 11);
  });

  it("locks the switch copy and the default interleave", () => {
    assert.equal(feedSwitchCopy("Echo trail", true).title, "Turn off Echo trail?");
    assert.equal(feedSwitchCopy("Echo trail", true).confirm, "Turn off Echo trail");
    assert.equal(feedSwitchCopy("Echo trail", false).title, "Turn Echo trail back on?");
    assert.equal(feedModulesNote(7), "7 modules · 7 on");
    assert.equal(DEFAULT_INTERLEAVE, "1 Lead · 3 Drop · 8 Beat · 11 Style · 16 Beat · 20 Because · 24 Run");
  });

  it("describes a module that is off, paused, or unscheduled", () => {
    assert.equal(feedFeatureStatus({ on: false, housesOn: true }), "Off · hidden from shoppers");
    assert.equal(
      feedFeatureStatus({ on: true, housesOn: false, pausedWithHouses: true }),
      "On · paused while Houses are off",
    );
    assert.equal(feedFeatureStatus({ on: true, housesOn: true, scheduled: false }), "On · nothing scheduled");
    assert.equal(feedFeatureStatus({ on: true, housesOn: true }), "On · visible to shoppers");
  });

  it("lists new lines from a followed live house", () => {
    const cards = followingHouseCards(SEED_LABELS, SEED_COLLECTIONS, SEED_STYLES, ["label-atelier-noir"]);
    assert.ok(cards.some((card) => card.kind === "line" && card.title === "Kinkistyles"));
    assert.ok(cards.some((card) => card.kind === "style" && card.houseName === "Atelier Noir"));
    assert.equal(followingHouseCards(SEED_LABELS, SEED_COLLECTIONS, SEED_STYLES, ["label-salt-loom"]).every((card) => card.houseId === "label-salt-loom"), true);
  });
});
