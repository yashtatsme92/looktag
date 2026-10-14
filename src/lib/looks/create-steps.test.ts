import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completedPhoneSteps, initialPhoneStep, phoneStepBlock } from "./create-steps.ts";

const empty = { imageSrc: "", title: "", tagCount: 0 };

describe("initialPhoneStep", () => {
  it("starts on the photo when nothing is chosen", () => {
    assert.equal(initialPhoneStep(empty), "photo");
  });

  it("opens crop after a photo that has not been named, pinned, or cropped", () => {
    assert.equal(initialPhoneStep({ imageSrc: "/look.jpg", title: "  ", tagCount: 0 }), "crop");
  });

  it("resumes a named, pinned, or cropped draft on the pin plate", () => {
    assert.equal(initialPhoneStep({ imageSrc: "/look.jpg", title: "Sunday coat", tagCount: 0 }), "pins");
    assert.equal(initialPhoneStep({ imageSrc: "/look.jpg", title: "", tagCount: 1 }), "pins");
    assert.equal(
      initialPhoneStep({ imageSrc: "/look.jpg", title: "  ", tagCount: 0, cropDone: true }),
      "pins",
    );
  });

  it("opens edit on the ready screen when a photo exists", () => {
    assert.equal(
      initialPhoneStep({ imageSrc: "/look.jpg", title: "Sunday coat", tagCount: 1 }, "edit"),
      "publish",
    );
  });
});

describe("phoneStepBlock", () => {
  it("blocks every step past the photo until a photo exists", () => {
    assert.equal(phoneStepBlock("name", empty), "Add a photo first.");
    assert.equal(phoneStepBlock("publish", empty), "Add a photo first.");
    assert.equal(phoneStepBlock("details", empty), "Add a photo first.");
    assert.equal(phoneStepBlock("photo", empty), null);
  });

  it("blocks the piece editor until a pin exists", () => {
    const look = { imageSrc: "/look.jpg", title: "Sunday coat", tagCount: 0 };
    assert.equal(phoneStepBlock("piece", look), "Pin a piece on the photo first.");
    assert.equal(phoneStepBlock("pins", look), null);
    assert.equal(phoneStepBlock("details", look), null);
  });
});

describe("completedPhoneSteps", () => {
  it("marks photo, then crop once the draft has moved on, then name and pins", () => {
    assert.deepEqual(completedPhoneSteps({ imageSrc: "/a.jpg", title: "", tagCount: 0 }), ["photo"]);
    assert.deepEqual(
      completedPhoneSteps({ imageSrc: "/a.jpg", title: "", tagCount: 0, cropDone: true }),
      ["photo", "crop"],
    );
    assert.deepEqual(completedPhoneSteps({ imageSrc: "/a.jpg", title: "Coat", tagCount: 2 }), [
      "photo",
      "crop",
      "name",
      "pins",
    ]);
  });
});
