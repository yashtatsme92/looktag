import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completedPhoneSteps, initialPhoneStep, phoneStepBlock } from "./create-steps.ts";

const empty = { imageSrc: "", title: "", tagCount: 0 };

describe("initialPhoneStep", () => {
  it("starts on the photo when nothing is chosen", () => {
    assert.equal(initialPhoneStep(empty), "photo");
  });

  it("asks for a name before pins when the photo has no title", () => {
    assert.equal(initialPhoneStep({ imageSrc: "/look.jpg", title: "  ", tagCount: 0 }), "name");
  });

  it("opens the piece when a named draft already has a pin", () => {
    assert.equal(initialPhoneStep({ imageSrc: "/look.jpg", title: "Sunday coat", tagCount: 1 }), "piece");
  });

  it("opens the pin board when the look is named but unpinned", () => {
    assert.equal(initialPhoneStep({ imageSrc: "/look.jpg", title: "Sunday coat", tagCount: 0 }), "pins");
  });
});

describe("phoneStepBlock", () => {
  it("blocks every step past the photo until a photo exists", () => {
    assert.equal(phoneStepBlock("name", empty), "Add a photo first.");
    assert.equal(phoneStepBlock("publish", empty), "Add a photo first.");
    assert.equal(phoneStepBlock("photo", empty), null);
  });

  it("blocks the piece editor until a pin exists", () => {
    const look = { imageSrc: "/look.jpg", title: "Sunday coat", tagCount: 0 };
    assert.equal(phoneStepBlock("piece", look), "Pin a piece on the photo first.");
    assert.equal(phoneStepBlock("pins", look), null);
  });
});

describe("completedPhoneSteps", () => {
  it("marks photo, name, and pins as they are filled", () => {
    assert.deepEqual(completedPhoneSteps({ imageSrc: "/a.jpg", title: "Coat", tagCount: 2 }), [
      "photo",
      "name",
      "pins",
    ]);
  });
});
