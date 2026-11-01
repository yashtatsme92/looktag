#!/usr/bin/env node
/**
 * #183 footer + canonical e2e at phone / tablet / desktop.
 *   BASE_URL=http://127.0.0.1:8080 node tests/e2e/domain-footer.mjs
 * FOOTER_EXPECT=all  → server runs with every footer link forced on.
 * SHOT_DIR=docs/pr-previews/issue183 → also save screenshots.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL || process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const EXPECT_ALL = process.env.FOOTER_EXPECT === "all";
const SHOT_DIR = process.env.SHOT_DIR || "";
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "tablet", width: 834, height: 1194 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
];
const PAGES = ["/", "/houses", "/looks/seed-sofia-sun-bleached-linen", "/create"];
/** Widths where the footer must be on screen and clickable (review on #188). */
const HIT_TEST_WIDTHS = new Set([390, 834, 1280]);
const HIT_TEST_PAGES = new Set(["/", "/looks/seed-sofia-sun-bleached-linen", "/create"]);
const SHOT_WIDTHS = new Set([390, 834, 1280]);

function slug(path) {
  if (path === "/") return "home";
  if (path.startsWith("/looks/")) return "look";
  return path.replace(/\W+/g, "");
}

/** Scroll the footer into view, then hit-test the centre of the footer and every link. */
async function assertFooterReachable(page, vp) {
  const footer = page.getByTestId("site-footer");
  await footer.scrollIntoViewIfNeeded({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="site-footer"]');
    if (!el) return { error: "no footer" };
    const targets = [el, ...el.querySelectorAll("a")];
    const misses = [];
    for (const target of targets) {
      const r = target.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const inView = r.width > 0 && r.height > 0 && r.top >= -1 && r.bottom <= window.innerHeight + 1 && x >= 0 && x <= window.innerWidth;
      const hit = document.elementFromPoint(x, y);
      const ok = inView && hit && (hit === target || target.contains(hit) || (target === el && el.contains(hit)));
      if (!ok) {
        misses.push(`${target.tagName}${target.textContent ? ` "${target.textContent.trim().slice(0, 20)}"` : ""} @${Math.round(r.top)}-${Math.round(r.bottom)} hit=${hit ? hit.tagName + "." + String(hit.className).slice(0, 30) : "none"}`);
      }
    }
    return { misses, count: targets.length };
  });
  assert.ok(!result.error, result.error);
  assert.deepEqual(result.misses, [], `footer occluded or off-screen at ${vp.width}px`);
}

/** Real wheel input: some element's scrollTop must grow and reach near its max. */
const WHEEL_WIDTHS = new Set([834, 1280]);
const WHEEL_PAGES = new Set(["/", "/houses", "/looks/seed-sofia-sun-bleached-linen"]);
async function assertWheelScrolls(page, vp) {
  const maxScroll = () => page.evaluate(() => {
    let best = { top: 0, max: 0 };
    for (const el of [document.scrollingElement, ...document.querySelectorAll("*")]) {
      if (!el) continue;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0 && el.scrollTop >= best.top) best = { top: el.scrollTop, max: Math.max(max, best.max) };
    }
    return best;
  });
  await page.waitForTimeout(500);
  const before = await maxScroll();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  const after = await maxScroll();
  assert.ok(after.top > before.top + 50, `wheel scroll increases (${before.top} -> ${after.top})`);
  assert.ok(after.top >= after.max - 80, `wheel reaches near max (${after.top}/${after.max})`);
}

if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch();
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "en-GB" });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("looktag-style-guide-v1", "done");
        localStorage.setItem("looktag-browse-coach-v1", "done");
        sessionStorage.setItem("looktag-boot-v1", "done");
      } catch {}
    });
    const page = await context.newPage();
    for (const path of PAGES) {
      await check(`${vp.name} ${path} footer`, async () => {
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const footer = page.getByTestId("site-footer");
        await footer.waitFor({ state: "attached", timeout: 15_000 });
        if (EXPECT_ALL) {
          await page.locator('[data-testid="site-footer"] a').first().waitFor({ timeout: 15_000 });
        } else {
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        }
        const links = footer.locator("a");
        const count = await links.count();
        if (EXPECT_ALL) {
          assert.ok(count >= 6, `expected footer links, got ${count}`);
          for (let i = 0; i < count; i += 1) {
            const href = (await links.nth(i).getAttribute("href")) ?? "";
            const text = (await links.nth(i).innerText()).trim();
            assert.ok(text && href && href !== "#", `link ${i} has label and href`);
            assert.ok(!/tbd/i.test(text + href), "no placeholder links");
          }
        } else {
          assert.equal(count, 0, "every footer link is off by default");
        }
        if (EXPECT_ALL && WHEEL_WIDTHS.has(vp.width) && WHEEL_PAGES.has(path)) {
          await assertWheelScrolls(page, vp);
          await assertFooterReachable(page, vp);
          await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.locator('[data-testid="site-footer"] a').first().waitFor({ timeout: 15_000 });
        }
        if (EXPECT_ALL && HIT_TEST_WIDTHS.has(vp.width) && HIT_TEST_PAGES.has(path)) {
          await assertFooterReachable(page, vp);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `no horizontal overflow (${overflow}px)`);
        if (SHOT_DIR && SHOT_WIDTHS.has(vp.width) && (HIT_TEST_PAGES.has(path) || path === "/houses")) {
          if (count) await footer.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(500);
          await page.screenshot({
            path: join(SHOT_DIR, `footer-${EXPECT_ALL ? "on" : "off"}-${slug(path)}-${vp.name}-${vp.width}x${vp.height}.png`),
          });
        }
      });
    }
    await check(`${vp.name} unknown look is noindex`, async () => {
      const res = await page.goto(`${BASE}/looks/e2e-missing-${Date.now()}`, { waitUntil: "domcontentloaded" });
      assert.ok(res);
      assert.equal(await page.locator('meta[name="robots"][content="noindex"]').count() > 0, true);
      if (process.env.EXPECT_HTTP_404 === "1") assert.equal(res.status(), 404);
    });
    await check(`${vp.name} share link uses the canonical origin`, async () => {
      await page.goto(`${BASE}/looks/seed-sofia-sun-bleached-linen`, { waitUntil: "domcontentloaded" });
      const canonical = await page.locator('link[rel="canonical"]').first().getAttribute("href");
      const ogUrl = await page.locator('meta[property="og:url"]').first().getAttribute("content");
      assert.ok(canonical && ogUrl && canonical === ogUrl, "canonical matches og:url");
      if (process.env.APP_URL) assert.ok(canonical.startsWith(process.env.APP_URL), "canonical from APP_URL");
    });
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("domain-footer e2e passed");
