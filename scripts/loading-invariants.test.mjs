import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

test("application source has no spinning or full-page spinner placeholders", async () => {
  const files = await sourceFiles(sourceRoot.pathname);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /animate-spin/, `${file} contains animate-spin`);
    assert.doesNotMatch(
      source,
      /(?:full-page|full-screen|page|screen)-spinner/i,
      `${file} contains a full-page spinner`,
    );
  }
});
