import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APP_VIEWPORT,
  appHeightOverride,
  isEditableElement,
  WEB_VIEWPORT,
  isAppViewport,
  keyboardInset,
  viewportContent,
} from "./viewport.ts";

describe("app viewport", () => {
  it("locks scale on the phone and in native shells", () => {
    assert.equal(isAppViewport(390), true);
    assert.equal(isAppViewport(767), true);
    assert.equal(isAppViewport(1280, true), true);
    assert.equal(isAppViewport(1280, false, true), true);
    assert.equal(viewportContent(390), APP_VIEWPORT);
    assert.match(APP_VIEWPORT, /maximum-scale=1/);
    assert.match(APP_VIEWPORT, /user-scalable=no/);
  });

  it("keeps pinch-zoom on tablet and desktop browsers", () => {
    assert.equal(isAppViewport(768), false);
    assert.equal(isAppViewport(1280), false);
    assert.equal(viewportContent(1024), WEB_VIEWPORT);
    assert.doesNotMatch(WEB_VIEWPORT, /user-scalable=no/);
  });
});

describe("keyboardInset", () => {
  it("is zero when the visual viewport fills the window", () => {
    assert.equal(keyboardInset(844, 844), 0);
    assert.equal(keyboardInset(844, 844, 0), 0);
  });

  it("reports the covered band when the keyboard is up", () => {
    assert.equal(keyboardInset(844, 500, 0), 344);
    assert.equal(keyboardInset(844, 500, 40), 304);
  });
});

describe("appHeightOverride", () => {
  it("ignores a static standalone shortfall when nothing is focused", () => {
    assert.equal(appHeightOverride(844, 810), null);
    assert.equal(appHeightOverride(844, 714), null);
    assert.equal(appHeightOverride(844, 844), null);
  });

  it("pins the visual height only while a field is focused and the viewport is shrunk", () => {
    assert.equal(appHeightOverride(844, 508, 0, true), 508);
    assert.equal(appHeightOverride(844, 844, 0, true), null);
  });
});

describe("isEditableElement", () => {
  it("detects text-entry elements", () => {
    assert.equal(isEditableElement({ tagName: "INPUT", type: "text" }), true);
    assert.equal(isEditableElement({ tagName: "TEXTAREA" }), true);
    assert.equal(isEditableElement({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(isEditableElement({ tagName: "INPUT", type: "checkbox" }), false);
    assert.equal(isEditableElement({ tagName: "BUTTON" }), false);
    assert.equal(isEditableElement(null), false);
  });
});
