#!/usr/bin/env node
/**
 * #178 smoothness: one layout tree, one serverFn per cold load,
 * the desktop shop sheet stays fixed while the page is locked,
 * and cold-load CLS at 390 stays under 0.05.
 */
import { chromium } from "playwright";
import { resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const browser = await chromium.launch({ headless: true });
const failures = [];

function check(name, ok, detail = "") {
  const line = `${ok ? "ok" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`;
  console.log(line);
  if (!ok) failures.push(line);
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__cls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
});
const serverFns = [];
page.on("request", (request) => {
  const url = request.url();
  if (!url.includes("_serverFn")) return;
  let name = url;
  try {
    name = atob(url.split("/_serverFn/")[1]?.split("?")[0] ?? "");
  } catch {
    /* keep the raw url */
  }
  if (name.includes("ingestClientSignals")) return;
  serverFns.push(name);
});
await page.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(600);
const trees = await page.evaluate(() => ({
  phone: document.querySelectorAll(".echo-stage").length,
  wide: document.querySelectorAll(".wide-home").length,
}));
check("one tree at 390", trees.phone === 1 && trees.wide === 0, JSON.stringify(trees));
const counts = serverFns.reduce((map, url) => {
  const key = url.split("?")[0];
  map[key] = (map[key] ?? 0) + 1;
  return map;
}, {});
const dupes = Object.entries(counts).filter(([, n]) => n > 1);
check("one request per serverFn", dupes.length === 0, dupes.map(([k, n]) => `${n}x ${k}`).join(" "));
const cls = await page.evaluate(() => window.__cls ?? 0);
check("CLS at 390 under 0.05", cls < 0.05, cls.toFixed(4));

await page.goto(`${origin}/houses`, { waitUntil: "networkidle", timeout: 30_000 });
const scroller = page.locator(".native-main");
await scroller.hover();
await page.mouse.wheel(0, 500);
await page.waitForTimeout(200);
const housesBefore = await page.evaluate(() => {
  const main = document.querySelector(".native-main");
  return main && main.scrollHeight > main.clientHeight + 20 ? main.scrollTop : window.scrollY;
});
await page.locator("a[href*='/houses/label-']").first().click();
await page.waitForURL(/\/houses\/label-/);
await page.goBack({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const housesAfter = await page.evaluate(() => document.querySelector(".native-main")?.scrollTop ?? 0);
check("back restores houses scroll", housesBefore > 100 && Math.abs(housesAfter - housesBefore) <= 4, `${housesBefore} -> ${housesAfter}`);

await context.close();

const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const deskPage = await desk.newPage();
await deskPage.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 30_000 });
const wideTrees = await deskPage.evaluate(() => ({
  phone: document.querySelectorAll(".echo-stage").length,
  wide: document.querySelectorAll(".wide-home").length,
}));
check("one tree at 1280", wideTrees.wide === 1 && wideTrees.phone === 0, JSON.stringify(wideTrees));
const lookHref = await deskPage.locator("a[href*='/looks/']").first().getAttribute("href");
await deskPage.goto(`${origin}${lookHref}`, { waitUntil: "networkidle", timeout: 30_000 });
const before = await deskPage.evaluate(() => window.scrollY);
await deskPage.getByRole("button", { name: "Shop whole look" }).click();
await deskPage.locator(".wide-shop-sheet-host").waitFor();
const host = await deskPage.locator(".wide-shop-sheet-host").boundingBox();
await deskPage.mouse.wheel(0, 800);
await deskPage.waitForTimeout(200);
const after = await deskPage.locator(".wide-shop-sheet-host").boundingBox();
const scrolled = await deskPage.evaluate(() => window.scrollY);
check("shop sheet stays fixed", host && after && Math.abs(host.y - after.y) <= 1, `top ${host?.y} -> ${after?.y}`);
check("page behind stays locked", Math.abs(scrolled - before) <= 1, `scroll ${before} -> ${scrolled}`);
await deskPage.keyboard.press("Escape");
const closed = await deskPage.locator(".wide-shop-sheet-host").count();
check("escape closes the shop sheet", closed === 0, `still open: ${closed}`);
await desk.close();

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} smoothness check(s) failed`);
  process.exit(1);
}
console.log("\nsmoothness ok");
