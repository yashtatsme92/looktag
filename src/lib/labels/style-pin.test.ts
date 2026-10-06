import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_LABELS, SEED_STYLES } from "./seed.ts";
import { resolveStylePin, searchStyles } from "./style-pin.ts";

describe("style pins", () => {
  it("links a live Style and keeps Shop data off the pin itself", () => {
    const pin = resolveStylePin("style-noir-column", SEED_STYLES, SEED_LABELS, true);
    assert.equal(pin?.styleName, "Column Dress");
    assert.equal(pin?.houseName, "Atelier Noir");
    assert.equal(pin?.lineSlug, "kinkistyles");
    assert.equal(resolveStylePin(undefined, SEED_STYLES, SEED_LABELS, true), null);
    assert.equal(resolveStylePin("style-noir-column", SEED_STYLES, SEED_LABELS, false), null);
  });

  it("falls back to a plain pin when the House is not live", () => {
    const paused = SEED_LABELS.map((label) =>
      label.id === "label-atelier-noir" ? { ...label, status: "disabled" as const } : label,
    );
    assert.equal(resolveStylePin("style-noir-column", SEED_STYLES, paused, true), null);
  });

  it("type-ahead matches the Style name", () => {
    const hits = searchStyles("column", SEED_STYLES, SEED_LABELS, true);
    assert.equal(hits[0]?.styleName, "Column Dress");
    assert.equal(searchStyles("column", SEED_STYLES, SEED_LABELS, false).length, 0);
  });
});
