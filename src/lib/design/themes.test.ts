import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, parseThemeId, THEME_IDS, THEMES, themeColor } from "./themes.ts";

describe("parseThemeId", () => {
  it("keeps known palettes", () => {
    for (const id of THEME_IDS) assert.equal(parseThemeId(id), id);
  });

  it("falls back to ink", () => {
    assert.equal(parseThemeId("beige"), DEFAULT_THEME);
    assert.equal(parseThemeId(null), DEFAULT_THEME);
    assert.equal(parseThemeId(""), DEFAULT_THEME);
  });
});

describe("palettes", () => {
  it("lists ten monotone looks", () => {
    assert.equal(THEME_IDS.length, 10);
    assert.equal(THEMES.length, 10);
    assert.deepEqual(
      THEMES.map((theme) => theme.id),
      [...THEME_IDS],
    );
  });
});

describe("themeColor", () => {
  it("returns the ground swatch", () => {
    assert.equal(themeColor("ink"), "#f4f4f4");
    assert.equal(themeColor("night"), "#121212");
    assert.equal(themeColor("navy"), "#0c121c");
    assert.equal(themeColor("moss"), "#eceee6");
  });
});
