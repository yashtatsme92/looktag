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
  { name: "desktop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
];
const PAGES = ["/", "/houses", "/looks/seed-sofia-sun-bleached-linen"];

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
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `no horizontal overflow (${overflow}px)`);
        if (path === "/houses" && SHOT_DIR) {
          await footer.scrollIntoViewIfNeeded().catch(() => {});
          await page.evaluate(() => document.querySelector("[data-testid=site-footer]")?.scrollIntoView({ block: "end" }));
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(SHOT_DIR, `footer-${EXPECT_ALL ? "on" : "off"}-${vp.name}-${vp.width}x${vp.height}.png`) });
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
