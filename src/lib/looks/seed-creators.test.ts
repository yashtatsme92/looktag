import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { SEED_LOOKS } from "./seed.ts";
import { seededCreatorHandle, seededCreatorId } from "./seed-creators.ts";
import { EDITORIAL_USER_ID } from "./types.ts";

describe("seeded creators", () => {
  it("gives every seeded look a stable creator id that is not editorial", () => {
    const ids = new Set<string>();
    for (const look of SEED_LOOKS) {
      assert.equal(look.userId, seededCreatorId(look.creator));
      assert.notEqual(look.userId, EDITORIAL_USER_ID);
      assert.match(look.userId, /^seed-[a-z0-9-]+$/);
      ids.add(look.userId);
    }
    assert.ok(ids.size >= 13);
  });

  it("maps one name to one id and a unique handle", () => {
    assert.equal(seededCreatorId("Sofia Brandt"), seededCreatorId("Sofia Brandt"));
    assert.equal(seededCreatorId("Sofia Brandt"), "seed-sofia-brandt");
    const handles = SEED_LOOKS.map((look) => seededCreatorHandle(look.creator));
    assert.equal(new Set(handles).size, new Set(SEED_LOOKS.map((look) => look.creator)).size);
    for (const handle of handles) {
      assert.match(handle, /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/);
    }
  });
});

describe("removed collection card", () => {
  it("deletes the unused 2:3 collection card and leaves no imports", () => {
    assert.equal(existsSync("src/components/labels/collection-card.tsx"), false);
    const sources = [
      "src/components/looks/look-card.tsx",
      "src/components/looks/saved-looks.tsx",
    ];
    for (const file of sources) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /collection-card/);
    }
  });
});
