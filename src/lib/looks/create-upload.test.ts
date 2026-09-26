import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatCreateUploadError, getCreateUploadPresentation } from "./create-upload.ts";

describe("getCreateUploadPresentation", () => {
  it("opens the phone on the look plate, not a camera wizard", () => {
    const copy = getCreateUploadPresentation({ phone: true });
    assert.equal(copy.title, "Start with a look");
    assert.equal(copy.primaryAction, "library");
    assert.equal(copy.primaryLabel, "Choose photo");
    assert.equal(copy.secondaryLabel, "Camera");
    assert.match(copy.body, /Guests can craft locally/i);
    assert.match(copy.body, /Publish asks for an account/i);
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
    assert.equal(copy.primaryAction, "library");
    assert.equal(copy.primaryLabel, "Reading…");
    assert.equal(copy.secondaryLabel, "Take photo");
  });
});

describe("formatCreateUploadError", () => {
  it("keeps self-contained recovery guidance intact", () => {
    assert.equal(formatCreateUploadError("Choose a photo (JPG, PNG, or WebP)."), "Choose a photo (JPG, PNG, or WebP).");
    assert.equal(formatCreateUploadError("That file is too large. Try one under 12 MB."), "That file is too large. Try one under 12 MB.");
  });

  it("adds a recoverable next step to generic failures", () => {
    assert.equal(
      formatCreateUploadError("Could not read that photo."),
      "Could not read that photo. Choose another photo and try again.",
    );
  });
});
