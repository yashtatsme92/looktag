import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APP_VIEWPORT,
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
