import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findPgliteAssetDirs, pgliteDestinations, resolvePgliteCopyTargets } from "./copy-pglite-assets.mjs";

test("lists Node server and Vercel destinations without preferring either", () => {
  const dests = pgliteDestinations("/app");
  assert.ok(dests.some((d) => d.includes(".output/server/_libs")));
  assert.ok(dests.some((d) => d.includes(".vercel/output")));
});

test("copies next to a Node server output even when Vercel folders are absent", () => {
  const root = mkdtempSync(join(tmpdir(), "pglite-copy-"));
  mkdirSync(join(root, ".output/server"), { recursive: true });
  const targets = resolvePgliteCopyTargets(root);
  assert.ok(targets.some((d) => d.endsWith(".output/server/_libs")));
  assert.equal(
    targets.some((d) => d.includes(".vercel")),
    false,
  );
});

test("discovers a traced pglite module in the Nitro server output", () => {
  const root = mkdtempSync(join(tmpdir(), "pglite-mod-"));
  const chunkDir = join(root, ".output/server/chunks");
  mkdirSync(chunkDir, { recursive: true });
  writeFileSync(join(chunkDir, "pglite.mjs"), "export {}\n");
  const targets = resolvePgliteCopyTargets(root);
  assert.ok(targets.includes(chunkDir));
});

test("copies beside a chunk that loads pglite.wasm even when the filename does not say pglite", () => {
  const root = mkdtempSync(join(tmpdir(), "pglite-ref-"));
  const chunkDir = join(root, ".output/server/chunks");
  mkdirSync(chunkDir, { recursive: true });
  writeFileSync(join(chunkDir, "index.mjs"), 'const wasm = new URL("pglite.wasm", import.meta.url);\n');
  const dirs = findPgliteAssetDirs(root);
  assert.ok(dirs.includes(chunkDir));
  assert.ok(resolvePgliteCopyTargets(root).includes(chunkDir));
});

test("copies into a traced @electric-sql/pglite package directory", () => {
  const root = mkdtempSync(join(tmpdir(), "pglite-pkg-"));
  const dist = join(root, ".output/server/node_modules/@electric-sql/pglite/dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.js"), "export {}\n");
  const dirs = findPgliteAssetDirs(root);
  assert.ok(dirs.includes(dist));
});
