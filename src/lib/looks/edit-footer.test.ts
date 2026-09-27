import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pieceEditorIsFooter, saveDockStaysDown } from "./edit-footer.ts";

describe("piece editor footer", () => {
  it("accepts a sheet sitting on the bottom of the plate", () => {
    assert.equal(pieceEditorIsFooter(580, 844, 0, 844), true);
  });

  it("rejects a card floating over the middle of the look", () => {
    assert.equal(pieceEditorIsFooter(354, 615, 0, 844), false);
  });

  it("rejects a sheet that stops short of the plate", () => {
    assert.equal(pieceEditorIsFooter(600, 780, 0, 844), false);
  });
});

describe("save dock", () => {
  it("keeps Save changes in the lower band", () => {
    assert.equal(saveDockStaysDown(715, 787, 844), true);
  });

  it("rejects a dock that has run up under the title", () => {
    assert.equal(saveDockStaysDown(120, 192, 844), false);
  });

  it("rejects a dock clipped past the viewport", () => {
    assert.equal(saveDockStaysDown(736, 820, 800), false);
  });
});
