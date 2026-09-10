import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNitroPreset } from "./nitro-preset.mjs";

test("defaults to a portable Node server", () => {
  assert.equal(resolveNitroPreset({}), "node-server");
});

test("Vercel CI selects the vercel preset", () => {
  assert.equal(resolveNitroPreset({ VERCEL: "1" }), "vercel");
});

test("NITRO_PRESET wins over Vercel", () => {
  assert.equal(resolveNitroPreset({ NITRO_PRESET: "bun", VERCEL: "1" }), "bun");
});

test("trims an explicit preset", () => {
  assert.equal(resolveNitroPreset({ NITRO_PRESET: " netlify " }), "netlify");
});
