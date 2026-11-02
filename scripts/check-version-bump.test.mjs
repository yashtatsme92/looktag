import assert from "node:assert/strict";
import { test } from "node:test";
import { requireVersionBump } from "./check-version-bump.mjs";

test("accepts a higher package semver", () => {
  assert.doesNotThrow(() => requireVersionBump("2.5.36", "2.5.37"));
});

test("rejects an unchanged package version", () => {
  assert.throws(() => requireVersionBump("2.5.36", "2.5.36"), /must be greater/);
});

test("rejects a lower package version", () => {
  assert.throws(() => requireVersionBump("2.5.36", "2.5.35"), /must be greater/);
});

test("rejects versions that are not semantic major.minor.patch", () => {
  assert.throws(() => requireVersionBump("2.5.36", "not-a-version"), /must use semver/);
});
