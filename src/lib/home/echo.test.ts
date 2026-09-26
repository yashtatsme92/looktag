import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Look } from "../looks/types.ts";
import { beatLabel, creatorRun, echoKicker, echoLane, pieceLine } from "./echo.ts";

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
  it("joins a house and a different creator", () => {
    assert.equal(echoKicker(look({ id: "a", creator: "Maya Chen" }), "Atelier Noir"), "Atelier Noir · Maya Chen");
  });

  it("does not repeat the same name", () => {
    assert.equal(echoKicker(look({ id: "a", creator: "Atelier Noir" }), "Atelier Noir"), "Atelier Noir");
  });
});

describe("beatLabel", () => {
  it("keeps a short caption and drops a long one", () => {
    assert.equal(beatLabel(look({ id: "a", caption: "Friday night linen" })), "Friday night linen");
    assert.equal(beatLabel(look({ id: "b", caption: "x".repeat(43) })), null);
    assert.equal(beatLabel(look({ id: "c" })), null);
  });
});

describe("echoLane", () => {
  const anchor = look({ id: "a", moods: ["evening"], userId: "maya" });

  it("prefers a shared mood or the same creator", () => {
    const lane = echoLane(anchor, [
      anchor,
      look({ id: "b", moods: ["evening"], userId: "other", creator: "Other" }),
      look({ id: "c", moods: ["knit"], userId: "maya" }),
      look({ id: "d", moods: ["coastal"], userId: "else", creator: "Else" }),
    ]);
    assert.deepEqual(
      lane.map((item) => item.id),
      ["b", "c"],
    );
  });

  it("falls back to the rest of the feed", () => {
    const lane = echoLane(look({ id: "a", moods: [], userId: "solo" }), [
      look({ id: "a", moods: [], userId: "solo" }),
      look({ id: "b", moods: ["knit"], userId: "other" }),
    ]);
    assert.deepEqual(
      lane.map((item) => item.id),
      ["b"],
    );
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
