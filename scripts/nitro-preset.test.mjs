import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNitroPreset, shouldCopyPgliteAssets } from "./nitro-preset.mjs";

test("empty env stays the Node server", () => {
  assert.equal(resolveNitroPreset({}), "node-server");
});

test("RENDER=true stays the Node server", () => {
  assert.equal(resolveNitroPreset({ RENDER: "true" }), "node-server");
});

test("NETLIFY=true selects the netlify preset", () => {
  assert.equal(resolveNitroPreset({ NETLIFY: "true" }), "netlify");
  assert.equal(shouldCopyPgliteAssets({ NETLIFY: "true" }), false);
});

test("NITRO_PRESET overrides NETLIFY", () => {
  assert.equal(resolveNitroPreset({ NITRO_PRESET: "node-server", NETLIFY: "true" }), "node-server");
  assert.equal(shouldCopyPgliteAssets({ NITRO_PRESET: "node-server", NETLIFY: "true" }), true);
});

test("VERCEL=1 selects the vercel preset", () => {
  assert.equal(resolveNitroPreset({ VERCEL: "1" }), "vercel");
});

test("NITRO_PRESET wins over Vercel", () => {
  assert.equal(resolveNitroPreset({ NITRO_PRESET: "bun", VERCEL: "1" }), "bun");
});

test("trims an explicit preset", () => {
  assert.equal(resolveNitroPreset({ NITRO_PRESET: " netlify " }), "netlify");
});

test("a Netlify value other than true does not switch the preset", () => {
  assert.equal(resolveNitroPreset({ NETLIFY: "1" }), "node-server");
});
