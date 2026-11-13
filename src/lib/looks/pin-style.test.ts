import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("pin style v1", () => {
  it("drops the pulse and the select scale, and draws a 28px dot", () => {
    const pin = readFileSync("src/components/looks/tag-pin.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    assert.doesNotMatch(pin, /pin-pulse|scale-110|pulse/);
    assert.doesNotMatch(css, /pin-pulse|@keyframes pin-pulse/);
    assert.match(css, /\.tag-pin-dot\s*\{[^}]*width:\s*28px/s);
    assert.match(css, /\.tag-pin-dot\s*\{[^}]*height:\s*28px/s);
    assert.match(css, /\.tag-pin\[aria-pressed="true"\] \.tag-pin-dot/);
  });
});
