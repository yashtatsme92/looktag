import { test } from "node:test";
import assert from "node:assert/strict";
import { injectGrokPwaHead } from "./grok-pwa-shared.mjs";

const share = `<!doctype html><html><head><title>Sun-Bleached Linen — Looktag</title><meta name="looktag:share" content="look"/><meta property="og:title" content="Sun-Bleached Linen — Looktag"/><meta property="og:url" content="https://thelooktag.com/looks/a"/></head><body></body></html>`;

test("share pages keep their own og tags (#183 F6)", () => {
  const out = injectGrokPwaHead(share, { host: "thelooktag.com", cwd: process.cwd() });
  const titles = out.match(/property="og:title"[^>]*/g) ?? [];
  assert.equal(titles.length, 1);
  assert.match(titles[0], /Sun-Bleached Linen/);
  assert.match(out, /og:url" content="https:\/\/thelooktag.com\/looks\/a"/);
});

test("other pages still get the generic og tags", () => {
  const out = injectGrokPwaHead("<!doctype html><html><head><title>Looktag</title></head><body></body></html>", {
    host: "thelooktag.com",
    cwd: process.cwd(),
  });
  assert.match(out, /property="og:title"/);
});
