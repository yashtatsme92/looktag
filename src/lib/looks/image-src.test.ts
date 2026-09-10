import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LOOK_IMAGE_DATA_URL_CHARS,
  MAX_LOOK_IMAGE_REF_CHARS,
  assertLookImageSrc,
  parseLookImageSrc,
} from "./image-src.ts";

function jpegDataUrl(payload = "/9j/4AAQ"): string {
  return `data:image/jpeg;base64,${payload}`;
}

describe("parseLookImageSrc", () => {
  it("accepts allowlisted JPEG / PNG / WebP data URLs under the size cap", () => {
    for (const src of [
      jpegDataUrl(),
      "data:image/png;base64,iVBOR",
      "data:image/webp;base64,UklGR",
      "data:image/jpg;base64,abc",
    ]) {
      const parsed = parseLookImageSrc(src);
      assert.equal(parsed.ok, true);
      if (parsed.ok) assert.equal(parsed.kind, "data-url");
    }
  });

  it("accepts short seed paths and https object-storage style refs", () => {
    const path = parseLookImageSrc("/looks/sunday-coat.jpg");
    assert.equal(path.ok, true);
    if (path.ok) assert.equal(path.kind, "ref");

    const https = parseLookImageSrc("https://cdn.example/looks/a.jpg");
    assert.equal(https.ok, true);
    if (https.ok) assert.equal(https.kind, "ref");
  });

  it("rejects empty or missing photos", () => {
    assert.equal(parseLookImageSrc("").ok, false);
    assert.equal(parseLookImageSrc(null).ok, false);
    assert.equal(parseLookImageSrc(undefined).ok, false);
  });

  it("rejects non-image data URLs and disallowed image types", () => {
    assert.equal(parseLookImageSrc("data:text/plain;base64,aaa").ok, false);
    assert.equal(parseLookImageSrc("data:image/gif;base64,aaa").ok, false);
    assert.equal(parseLookImageSrc("data:image/svg+xml;base64,aaa").ok, false);
    const bad = parseLookImageSrc("data:image/gif;base64,aaa");
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.error, /JPEG|PNG|WebP/i);
  });

  it("rejects oversized data URLs", () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(MAX_LOOK_IMAGE_DATA_URL_CHARS)}`;
    assert.ok(oversized.length > MAX_LOOK_IMAGE_DATA_URL_CHARS);
    const parsed = parseLookImageSrc(oversized);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.match(parsed.error, /too large/i);
  });

  it("rejects http and overlong reference URLs", () => {
    assert.equal(parseLookImageSrc("http://cdn.example/a.jpg").ok, false);
    assert.equal(parseLookImageSrc(`https://x.test/${"a".repeat(MAX_LOOK_IMAGE_REF_CHARS)}`).ok, false);
    assert.equal(parseLookImageSrc("/looks/../secret.jpg").ok, false);
  });
});

describe("assertLookImageSrc", () => {
  it("throws on rejection cases used by saveLook", () => {
    assert.throws(() => assertLookImageSrc(""), /photo/i);
    assert.throws(() => assertLookImageSrc("data:image/gif;base64,xx"), /JPEG|PNG|WebP/i);
    assert.throws(
      () => assertLookImageSrc(`data:image/jpeg;base64,${"B".repeat(MAX_LOOK_IMAGE_DATA_URL_CHARS)}`),
      /too large/i,
    );
  });

  it("returns the validated string", () => {
    const src = jpegDataUrl("qq");
    assert.equal(assertLookImageSrc(src), src);
  });
});
