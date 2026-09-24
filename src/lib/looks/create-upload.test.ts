import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCreateUploadPresentation } from "./create-upload.ts";

describe("getCreateUploadPresentation", () => {
  it("keeps the phone flow camera-first", () => {
    const copy = getCreateUploadPresentation({ phone: true });
    assert.equal(copy.title, "Add a look photo");
    assert.equal(copy.primaryAction, "camera");
    assert.equal(copy.primaryLabel, "Take photo");
    assert.equal(copy.secondaryLabel, "Choose from library");
    assert.match(copy.body, /Take or choose/i);
  });

  it("makes desktop choose-first and keeps drag-drop copy", () => {
    const copy = getCreateUploadPresentation({ phone: false });
    assert.equal(copy.title, "Choose a look photo");
    assert.equal(copy.primaryAction, "library");
    assert.equal(copy.primaryLabel, "Choose photo");
    assert.equal(copy.secondaryLabel, "Take photo");
    assert.match(copy.body, /drag and drop/i);
  });

  it("returns an explicit reading state before editing begins", () => {
    const copy = getCreateUploadPresentation({ phone: false, reading: true });
    assert.equal(copy.title, "Reading your photo…");
    assert.match(copy.body, /Preview is on the way/i);
  });
});
