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
    assert.doesNotMatch(source, /animate-pulse/, `${file} contains animate-pulse`);
    assert.doesNotMatch(
      source,
      /(?:full-page|full-screen|page|screen)-spinner/i,
      `${file} contains a full-page spinner`,
    );
  }
});

test("loading motion uses reduced-motion overrides and responsive skeleton columns", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /--dur-crossfade:\s*150ms/);
  assert.match(styles, /--skeleton-delay:\s*300ms/);
  assert.match(styles, /--skeleton-min:\s*400ms/);
  assert.match(styles, /--load-timeout:\s*10000ms/);
  assert.match(styles, /@media \(min-width: 1024px\) and \(max-width: 1279px\)/);
  assert.match(styles, /@media \(min-width: 1280px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.is-loading-old[\s\S]*?transition-duration: 0ms/);
});
