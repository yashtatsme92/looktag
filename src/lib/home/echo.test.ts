import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Look } from "../looks/types.ts";
import { beatLabel, creatorRun, echoKicker, ECHO_IDLE_MS, forYouOrder, ECHO_SESSION_KEY, rankEcho, readEchoSession, recordEcho, echoSnapIndex, echoSwipe, pieceLine } from "./echo.ts";

function look(partial: Partial<Look> & Pick<Look, "id">): Look {
  return {
    userId: "maya",
    title: partial.id,
    caption: "",
    creator: "Maya Chen",
    imageSrc: "/look.jpg",
    createdAt: 0,
    updatedAt: 0,
    tags: [],
    ...partial,
  };
}

describe("pieceLine", () => {
  it("counts pieces and never includes a price", () => {
    assert.equal(pieceLine(look({ id: "a" })), "");
    assert.equal(
      pieceLine(
        look({
          id: "b",
          tags: [
            {
              id: "t",
              x: 0,
              y: 0,
              name: "Coat",
              brand: "",
              price: "480",
              currency: "EUR",
              url: "",
              retailerId: "",
            },
          ],
        }),
      ),
      "1 piece",
    );
  });
});

describe("echoKicker", () => {
  it("shows the creator only, never the house", () => {
    assert.equal(echoKicker(look({ id: "a", creator: "Maya Chen" }), "Atelier Noir"), "Maya Chen");
    assert.equal(echoKicker(look({ id: "a", creator: "Atelier Noir" }), "Atelier Noir"), "Atelier Noir");
    assert.equal(echoKicker(look({ id: "b", creator: "  " })), "");
  });
});

describe("beatLabel", () => {
  it("keeps a short caption and drops a long one", () => {
    assert.equal(beatLabel(look({ id: "a", caption: "Friday night linen" })), "Friday night linen");
    assert.equal(beatLabel(look({ id: "b", caption: "x".repeat(43) })), null);
    assert.equal(beatLabel(look({ id: "c" })), null);
  });
});

describe("rankEcho", () => {
  const anchor = look({ id: "a", moods: ["evening", "knit"], userId: "maya" });
  const ids = (looks: Look[]) => looks.map((item) => item.id);
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("ranks by shared moods, then same creator, then For you order", () => {
    const lane = rankEcho(anchor, [
      anchor,
      look({ id: "b", moods: ["evening"], userId: "o1" }),
      look({ id: "c", moods: ["evening", "knit"], userId: "o2" }),
      look({ id: "d", moods: ["coastal"], userId: "maya" }),
      look({ id: "e", moods: ["coastal"], userId: "o3" }),
    ]);
    assert.deepEqual(ids(lane), ["c", "b", "d", "e"]);
  });

  it("excludes the anchor and looks without an image", () => {
    const lane = rankEcho(anchor, [anchor, look({ id: "b", moods: ["knit"], imageSrc: "" }), look({ id: "c" })]);
    assert.deepEqual(ids(lane), ["c"]);
  });

  it("falls back to For you order for no moods or no overlap", () => {
    const rest = [look({ id: "x", userId: "o1", moods: ["a"] }), look({ id: "y", userId: "o2", moods: ["b"] })];
    const forYou = [rest[1], rest[0]];
    const seed = look({ id: "s", moods: [], userId: "solo" });
    assert.deepEqual(ids(rankEcho(seed, [seed, ...rest], { forYouOrder: forYou })), ["y", "x"]);
    assert.deepEqual(ids(rankEcho(look({ id: "s", moods: ["zzz"], userId: "solo" }), rest, { forYouOrder: forYou })), ["y", "x"]);
  });

  it("breaks ties by the For you order, not title", () => {
    const b = look({ id: "b", title: "Z", moods: ["knit"], userId: "o1" });
    const c = look({ id: "c", title: "A", moods: ["knit"], userId: "o2" });
    assert.deepEqual(ids(rankEcho(anchor, [c, b], { forYouOrder: [b, c] })), ["b", "c"]);
  });

  it("applies the session bias only after 2 activations and only as a tie-break", () => {
    const b = look({ id: "b", moods: ["knit"], userId: "o1" });
    const c = look({ id: "c", moods: ["evening"], userId: "o2" });
    const d = look({ id: "d", moods: ["evening", "knit"], userId: "o3" });
    const store = memory();
    const one = recordEcho(store, { moods: ["evening"] }, 1000);
    assert.deepEqual(ids(rankEcho(anchor, [b, c, d], { session: one })), ["d", "b", "c"]);
    const two = recordEcho(store, { moods: ["evening"] }, 2000);
    assert.deepEqual(ids(rankEcho(anchor, [b, c, d], { session: two })), ["d", "c", "b"]);
  });

  it("never adds a slot and keeps the on-screen prefix", () => {
    const b = look({ id: "b", moods: ["knit"], userId: "o1" });
    const c = look({ id: "c", moods: ["evening", "knit"], userId: "o2" });
    const lane = rankEcho(anchor, [b, c], { onScreen: ["b"] });
    assert.deepEqual(ids(lane), ["b", "c"]);
  });

  it("keeps Fresh first order among ties", () => {
    const old = look({ id: "old", moods: ["knit"], userId: "o1", createdAt: 1 });
    const fresh = look({ id: "fresh", moods: ["knit"], userId: "o2", createdAt: 9 });
    assert.deepEqual(ids(rankEcho(anchor, [old, fresh], { forYouOrder: [fresh, old] })), ["fresh", "old"]);
  });
});

describe("one engine for every surface", () => {
  const anchor = look({ id: "a", moods: ["knit"], userId: "maya" });
  const deck = [
    anchor,
    look({ id: "old", moods: ["knit"], userId: "o1", createdAt: 1 }),
    look({ id: "fresh", moods: ["knit"], userId: "o2", createdAt: 99_000_000 }),
  ];
  const input = { lessIds: [], savedIds: [], savesOn: true, freshOn: true, now: 100_000_000, freshWindow: "24h" as const };

  it("ranks the same from the same For you order on home and look detail", () => {
    const order = forYouOrder(deck, input);
    const home = rankEcho(anchor, deck, { forYouOrder: order });
    const detail = rankEcho(anchor, deck, { forYouOrder: forYouOrder(deck, input) });
    assert.deepEqual(detail.map((item) => item.id), home.map((item) => item.id));
    assert.equal(home[0]?.id, "fresh");
  });

  it("keeps the on-screen look in place when ranking changes", () => {
    const better = look({ id: "better", moods: ["knit", "evening"], userId: "o3" });
    const wide = look({ id: "a2", moods: ["knit", "evening"], userId: "maya" });
    const seed = look({ id: "s", moods: ["knit", "evening"], userId: "maya" });
    const lane = rankEcho(seed, [...deck, better, wide], { onScreen: ["old"] });
    assert.equal(lane[0]?.id, "old");
    assert.equal(lane.length, 5);
  });
});

describe("echo session", () => {
  it("resets after 30 minutes idle", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    recordEcho(store, { moods: ["knit"] }, 0);
    recordEcho(store, { moods: ["knit"] }, 1000);
    assert.equal(readEchoSession(store, 1000 + ECHO_IDLE_MS).counts.knit, 2);
    assert.equal(readEchoSession(store, 1000 + ECHO_IDLE_MS + 1).activations, 0);
    assert.ok(data.has(ECHO_SESSION_KEY));
  });

  it("tolerates missing or broken storage", () => {
    assert.equal(readEchoSession(null, 0).activations, 0);
    assert.equal(readEchoSession({ getItem: () => "{", setItem() {} }, 0).activations, 0);
  });
});

describe("creatorRun", () => {
  it("starts at the opened look and stays with that creator", () => {
    const run = creatorRun(look({ id: "b", userId: "maya" }), [
      look({ id: "a", userId: "maya" }),
      look({ id: "b", userId: "maya" }),
      look({ id: "c", userId: "other", creator: "Else" }),
      look({ id: "d", userId: "maya" }),
    ]);
    assert.deepEqual(
      run.map((item) => item.id),
      ["b", "d", "a"],
    );
  });
});

describe("echoSwipe", () => {
  it("follows a vertical swipe and ignores a small drag", () => {
    assert.equal(echoSwipe({ dx: 4, dy: -80, index: 0, length: 3, mode: "feed" }), "next");
    assert.equal(echoSwipe({ dx: 4, dy: 80, index: 1, length: 3, mode: "feed" }), "prev");
    assert.equal(echoSwipe({ dx: 10, dy: -20, index: 0, length: 3, mode: "feed" }), "stay");
    assert.equal(echoSwipe({ dx: 4, dy: -80, index: 2, length: 3, mode: "feed" }), "stay");
  });

  it("peels left into the lane and ends a creator run", () => {
    assert.equal(echoSwipe({ dx: -90, dy: 10, index: 0, length: 3, mode: "feed" }), "lane");
    assert.equal(echoSwipe({ dx: -20, dy: -80, index: 1, length: 2, mode: "creator" }), "end");
    assert.equal(
      echoSwipe({ dx: 0, dy: -80, index: 2, length: 2, mode: "creator", showingReturn: true }),
      "back",
    );
  });
});

describe("echo snap", () => {
  it("lands on one full plate", () => {
    assert.equal(echoSnapIndex(0, 700, 4), 0);
    assert.equal(echoSnapIndex(360, 700, 4), 1);
    assert.equal(echoSnapIndex(700, 700, 4), 1);
    assert.equal(echoSnapIndex(2000, 700, 3), 2);
    assert.equal(echoSnapIndex(10, 0, 3), 0);
  });
});
