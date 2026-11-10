import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FEED_MANIFEST } from "./feed-manifest.ts";
import { feedEntryFor, feedSrcSet, largestSource } from "./feed-image.ts";

const ROOT = join(import.meta.dirname, "../../..");
const LIMIT = 120_000;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

describe("feed images", () => {
  it("maps a seed photo to avif, webp and jpeg srcsets", () => {
    const entry = feedEntryFor("/looks/sunday-coat.jpg");
    assert.ok(entry);
    assert.match(feedSrcSet(entry.avif), /480w/);
    assert.match(feedSrcSet(entry.webp), /w$/);
    assert.ok(largestSource(entry.jpeg));
    assert.equal(feedEntryFor("/looks/missing.jpg"), null);
    assert.equal(feedEntryFor("https://example.com/a.jpg"), null);
    assert.equal(feedEntryFor("/looks/../etc/passwd"), null);
  });

  it("keeps every card derivative at or under 120KB and covers every seed jpeg", () => {
    const originals = walk(join(ROOT, "public/looks")).filter(
      (path) => path.endsWith(".jpg") && !path.includes(`${join("looks", "feed")}`),
    );
    assert.ok(originals.length > 30);
    for (const path of originals) {
      const src = "/looks/" + path.slice(join(ROOT, "public/looks").length + 1).split("\\").join("/");
      const entry = FEED_MANIFEST[src];
      assert.ok(entry, `missing feed entry for ${src}`);
      for (const source of [...entry.avif, ...entry.webp, ...entry.jpeg]) {
        const file = join(ROOT, "public", source.url.slice(1));
        const size = statSync(file).size;
        assert.ok(size > 0 && size <= LIMIT, `${source.url} is ${size} bytes`);
        assert.equal(readFileSync(file).length, size);
      }
    }
  });
});
