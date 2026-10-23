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
await deskPage.locator(".look-sheet-host").waitFor();
const host = await deskPage.locator(".look-sheet-host").boundingBox();
await deskPage.mouse.wheel(0, 800);
await deskPage.waitForTimeout(200);
const after = await deskPage.locator(".look-sheet-host").boundingBox();
const scrolled = await deskPage.evaluate(() => window.scrollY);
check("shop sheet stays fixed", host && after && Math.abs(host.y - after.y) <= 1, `top ${host?.y} -> ${after?.y}`);
check("page behind stays locked", Math.abs(scrolled - before) <= 1, `scroll ${before} -> ${scrolled}`);
await deskPage.keyboard.press("Escape");
const closed = await deskPage.locator(".look-sheet-host").count();
check("escape closes the shop sheet", closed === 0, `still open: ${closed}`);
await desk.close();

async function clsOf(browser, path, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, locale: "en-GB" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(400);
  const cls = await page.evaluate(() => window.__cls ?? 0);
  await context.close();
  return cls;
}

const lookPath = lookHref;
for (const [width, height] of [[390, 844], [834, 1194], [1280, 800]]) {
  for (const path of ["/", lookPath, "/houses", "/rank", "/create", "/login"]) {
    if (width !== 390 && path !== "/" && path !== lookPath) continue;
    const cls = await clsOf(browser, path, width, height);
    check(`CLS ${width} ${path}`, cls < 0.05, cls.toFixed(4));
  }
}

const motion = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const motionPage = await motion.newPage();
await motionPage.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
const tokens = await motionPage.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return {
    crossfade: cs.getPropertyValue("--dur-crossfade").trim(),
    indicator: cs.getPropertyValue("--dur-indicator").trim(),
    image: cs.getPropertyValue("--dur-image").trim(),
    pulse: cs.getPropertyValue("--dur-pulse").trim(),
    stagger: cs.getPropertyValue("--stagger-step").trim(),
  };
});
check("motion tokens", tokens.crossfade === "150ms" && tokens.indicator === "200ms" && tokens.image === "200ms" && tokens.pulse === "1200ms" && tokens.stagger === "30ms", JSON.stringify(tokens));
await motion.close();

const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const reducedPage = await reduced.newPage();
await reducedPage.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await reducedPage.waitForTimeout(400);
const reducedAnim = await reducedPage.evaluate(() => {
  const probe = document.createElement("div");
  probe.className = "skeleton";
  document.body.appendChild(probe);
  const name = getComputedStyle(probe).animationName;
  probe.remove();
  return name;
});
check("reduced motion skeleton", reducedAnim === "none", reducedAnim);
await reduced.close();

const phoneLook = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB", hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
const phonePage = await phoneLook.newPage();
await phonePage.goto(`${origin}${lookPath}`, { waitUntil: "networkidle", timeout: 30_000 });
await phonePage.locator(".look-plate-shop").click();
await phonePage.locator(".look-sheet").waitFor();
const sheetBox = await phonePage.locator(".look-sheet").boundingBox();
const locked = await phonePage.evaluate(() => document.documentElement.classList.contains("overlay-lock"));
await phonePage.mouse.wheel(0, 400);
const sheetBox2 = await phonePage.locator(".look-sheet").boundingBox();
check("phone sheet stays fixed", sheetBox && sheetBox2 && Math.abs(sheetBox.y - sheetBox2.y) <= 1, `${sheetBox?.y} -> ${sheetBox2?.y}`);
check("phone sheet locks the page", locked);
const ob = await phonePage.evaluate(() => getComputedStyle(document.querySelector(".look-sheet")).overscrollBehavior);
check("phone sheet overscroll contain", ob === "contain" || ob === "contain contain", ob);
await phonePage.keyboard.press("Escape");
check("phone sheet escape", (await phonePage.locator(".look-sheet").count()) === 0);
const pin = phonePage.locator(".tag-pin").first();
if (await pin.count()) {
  await pin.click();
  await phonePage.locator(".look-plate-piece").waitFor();
  const focused = await phonePage.evaluate(() => document.activeElement?.closest(".look-plate-piece") !== null);
  await phonePage.keyboard.press("Escape");
  const gone = (await phonePage.locator(".look-plate-piece").count()) === 0;
  check("pin focus and escape", focused && gone, `focused=${focused} gone=${gone}`);
}
await phoneLook.close();

const shareCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const sharePage = await shareCtx.newPage();
await sharePage.goto(`${origin}${lookPath}`, { waitUntil: "networkidle", timeout: 30_000 });
await sharePage.getByRole("button", { name: "Share" }).click();
const shareHost = sharePage.locator(".wide-share");
await shareHost.waitFor();
const sharePos = await shareHost.evaluate((el) => getComputedStyle(el).position);
const beforeShare = await sharePage.evaluate(() => window.scrollY);
await sharePage.mouse.wheel(0, 500);
const shareBoxA = await shareHost.boundingBox();
await sharePage.waitForTimeout(100);
const shareBoxB = await shareHost.boundingBox();
const afterShare = await sharePage.evaluate(() => window.scrollY);
check("share is fixed", sharePos === "fixed" && shareBoxA && shareBoxB && Math.abs(shareBoxA.y - shareBoxB.y) <= 1, sharePos);
check("share locks the page", Math.abs(afterShare - beforeShare) <= 1, `${beforeShare} -> ${afterShare}`);
await sharePage.keyboard.press("Escape");
check("share escape", (await shareHost.count()) === 0);
await shareCtx.close();

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} smoothness check(s) failed`);
  process.exit(1);
}
console.log("\nsmoothness ok");
