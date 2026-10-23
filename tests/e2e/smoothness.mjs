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

function decodeServerFn(url) {
  const raw = url.split("/_serverFn/")[1]?.split("?")[0] ?? "";
  try {
    return atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return url;
  }
}

function trackName(url) {
  const name = decodeServerFn(url);
  if (name.includes("ingestClientSignals")) return "";
  return name;
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
  const name = trackName(url);
  if (!name) return;
  serverFns.push(name);
});
await page.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(600);
const trees = await page.evaluate(() => ({
  phone: document.querySelectorAll(".echo-stage").length,
  wide: document.querySelectorAll(".wide-home").length,
}));
check("one tree at 390", trees.phone === 1 && trees.wide === 0, JSON.stringify(trees));
const bleed = await page.evaluate(() => {
  const photo = document.querySelector(".echo-photo");
  const stage = document.querySelector(".echo-stage");
  if (!photo || !stage) return { gap: 999, aspect: "missing" };
  const photoBox = photo.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  return {
    gap: Math.round(stageBox.bottom - photoBox.bottom),
    aspect: getComputedStyle(photo).aspectRatio,
    photoH: Math.round(photoBox.height),
    stageH: Math.round(stageBox.height),
  };
});
check("390 home photo is full bleed", bleed.gap <= 1 && (bleed.aspect === "auto" || bleed.aspect === "normal"), JSON.stringify(bleed));
const counts = serverFns.reduce((map, name) => {
  map[name] = (map[name] ?? 0) + 1;
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
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
const housesMark = serverFns.length;
await page.goBack({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const housesAfter = await page.evaluate(() => document.querySelector(".native-main")?.scrollTop ?? 0);
check("back restores houses scroll", housesBefore > 100 && Math.abs(housesAfter - housesBefore) <= 4, `${housesBefore} -> ${housesAfter}`);
const housesAdded = serverFns.slice(housesMark).filter((name) => !name.includes("recordShareView"));
check("back to houses makes no data requests", housesAdded.length === 0, housesAdded.join(" | ") || "0");
const housesSkeleton = await page.evaluate(() => document.documentElement.classList.contains("route-skeleton") || Boolean(document.querySelector(".skeleton")));
check("back to houses shows no skeleton", !housesSkeleton);

await page.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 30_000 });
await page.locator("a[href*='/looks/']").first().click();
await page.waitForURL(/\/looks\//);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
const feedMark = serverFns.length;
await page.goBack({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const feedAdded = serverFns.slice(feedMark).filter((name) => !name.includes("recordShareView"));
const feedSkeleton = await page.evaluate(() => document.documentElement.classList.contains("route-skeleton") || Boolean(document.querySelector(".skeleton")));
check("back to feed makes no data requests", feedAdded.length === 0, feedAdded.join(" | ") || "0");
check("back to feed shows no skeleton", !feedSkeleton);

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
await phonePage.waitForFunction(() => {
  const sheet = document.querySelector(".look-sheet");
  if (!sheet) return false;
  const top = sheet.getBoundingClientRect().top;
  const prev = window.__sheetTop;
  window.__sheetTop = top;
  return typeof prev === "number" && Math.abs(prev - top) < 0.5;
});
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

function trackFns(page, bucket) {
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("_serverFn")) return;
    const name = trackName(url);
    if (!name) return;
    bucket.push(name);
  });
}

async function backgroundScroll(page) {
  return page.evaluate(() => ({
    y: window.scrollY,
    doc: document.scrollingElement ? document.scrollingElement.scrollTop : 0,
    main: document.querySelector(".native-main")?.scrollTop ?? 0,
    panel: document.querySelector(".wide-panel-bd")?.scrollTop ?? 0,
  }));
}

function scrollSame(before, after) {
  return ["y", "doc", "main", "panel"].every((key) => Math.abs(before[key] - after[key]) <= 1);
}

async function assertBackgroundLocked(page, label) {
  const before = await backgroundScroll(page);
  await page.mouse.wheel(0, 900);
  await page.keyboard.press("End");
  await page.keyboard.press("PageDown");
  await page.keyboard.press("ArrowDown");
  const root = page.locator("[data-overlay-root]").last();
  if (await root.count()) await root.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  const after = await backgroundScroll(page);
  check(`${label} background stays locked`, scrollSame(before, after), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}

for (const width of [1024, 1280]) {
  const overlayCtx = await browser.newContext({ viewport: { width, height: 800 }, locale: "en-GB" });
  const overlayPage = await overlayCtx.newPage();
  await overlayPage.goto(`${origin}${lookPath}`, { waitUntil: "networkidle", timeout: 30_000 });
  await overlayPage.evaluate(() => window.scrollTo(0, 0));

  await overlayPage.getByRole("button", { name: "Share" }).click();
  await overlayPage.locator(".wide-share").waitFor();
  const shareFocus = await overlayPage.evaluate(() => document.querySelector(".wide-share")?.contains(document.activeElement) ?? false);
  check(`share ${width} focus moves in`, shareFocus);
  await overlayPage.keyboard.press("Tab");
  const shareTab = await overlayPage.evaluate(() => document.querySelector(".wide-share")?.contains(document.activeElement) ?? false);
  await overlayPage.keyboard.down("Shift");
  await overlayPage.keyboard.press("Tab");
  await overlayPage.keyboard.up("Shift");
  const shareTrap = await overlayPage.evaluate(() => document.querySelector(".wide-share")?.contains(document.activeElement) ?? false);
  check(`share ${width} traps tab`, shareTab && shareTrap);
  await assertBackgroundLocked(overlayPage, `share ${width}`);
  await overlayPage.getByRole("button", { name: "Share" }).focus();
  await overlayPage.keyboard.press("Escape");
  const shareClosed = (await overlayPage.locator(".wide-share").count()) === 0;
  const shareBack = await overlayPage.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Share");
  check(`share ${width} escape from trigger returns focus`, shareClosed && shareBack, `closed=${shareClosed} focus=${shareBack}`);

  await overlayPage.getByRole("button", { name: "Shop whole look" }).click();
  await overlayPage.locator(".look-sheet").waitFor();
  const shopFocus = await overlayPage.evaluate(() => document.querySelector(".look-sheet")?.contains(document.activeElement) ?? false);
  check(`shop ${width} focus moves in`, shopFocus);
  await overlayPage.keyboard.press("Tab");
  const shopTab = await overlayPage.evaluate(() => document.querySelector(".look-sheet")?.contains(document.activeElement) ?? false);
  check(`shop ${width} traps tab`, shopTab);
  await assertBackgroundLocked(overlayPage, `shop ${width}`);
  await overlayPage.keyboard.press("Escape");
  check(`shop ${width} escape closes`, (await overlayPage.locator(".look-sheet").count()) === 0);

  await overlayPage.getByRole("button", { name: "Save" }).click();
  await overlayPage.locator("[data-vaul-drawer]").waitFor({ timeout: 5_000 });
  const signFocus = await overlayPage.evaluate(() => {
    const root = document.querySelector("[data-vaul-drawer]");
    return Boolean(root && root.contains(document.activeElement));
  });
  check(`sign-in ${width} focus moves in`, signFocus);
  await overlayPage.keyboard.press("Tab");
  const signTab = await overlayPage.evaluate(() => {
    const root = document.querySelector("[data-vaul-drawer]");
    return Boolean(root && root.contains(document.activeElement));
  });
  check(`sign-in ${width} traps tab`, signTab);
  await assertBackgroundLocked(overlayPage, `sign-in ${width}`);
  await overlayPage.keyboard.press("Escape");
  await overlayPage.waitForTimeout(400);
  const signOpen = await overlayPage.locator("[data-vaul-drawer][data-state='open']").count();
  check(`sign-in ${width} escape closes`, signOpen === 0, `open=${signOpen}`);
  await overlayCtx.close();
}

async function lookCls(delay) {
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
  await page.route("**/*_serverFn*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.continue();
  });
  await page.goto(`${origin}/looks/seed-sunday-coat?loadDelay=${delay}`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForFunction(
    () => {
      const img = document.querySelector(".look-plate img");
      return Boolean(img && img.complete && img.naturalWidth > 0 && getComputedStyle(img).visibility !== "hidden");
    },
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);
  const cls = await page.evaluate(() => window.__cls ?? 0);
  await context.close();
  return cls;
}

for (const delay of [400, 1600]) {
  const cls = await lookCls(delay);
  check(`look CLS 390 at ${delay}ms`, cls < 0.05, cls.toFixed(4));
}

const createCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
const createPage = await createCtx.newPage();
const createFns = [];
trackFns(createPage, createFns);
await createPage.goto(`${origin}/create`, { waitUntil: "networkidle", timeout: 30_000 });
await createPage.waitForTimeout(700);
const houseCalls = createFns.filter((name) => name.includes("getMyHouse"));
check("create calls getMyHouse once", houseCalls.length === 1, `${houseCalls.length} ${createFns.filter((name) => name.includes("getMyHouse")).join(" | ")}`);
await createCtx.close();

/** After a close, inline overflow is back and the document can move again. */
async function assertScrollsAfterClose(page, label) {
  const released = await page
    .waitForFunction(
      () => {
        const html = document.documentElement;
        return html.style.overflow !== "hidden" && document.body.style.overflow !== "hidden" && !html.classList.contains("overlay-lock");
      },
      null,
      { timeout: 4_000 },
    )
    .then(() => true)
    .catch(() => false);
  const result = await page.evaluate(() => {
    const html = document.documentElement;
    const stuck = html.style.overflow === "hidden" || document.body.style.overflow === "hidden" || html.classList.contains("overlay-lock");
    const pad = document.createElement("div");
    pad.setAttribute("data-scroll-probe", "");
    pad.style.height = "140vh";
    document.body.appendChild(pad);
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    window.scrollTo(0, 120);
    document.body.scrollTop = Math.max(document.body.scrollTop, 120);
    const y = window.scrollY;
    const body = document.body.scrollTop;
    pad.remove();
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    let blocked = false;
    const mark = (event) => {
      blocked = event.defaultPrevented;
    };
    document.addEventListener("wheel", mark, true);
    document.body.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true }));
    document.removeEventListener("wheel", mark, true);
    return { stuck, blocked, y, body, html: html.style.overflow, bodyStyle: document.body.style.overflow };
  });
  check(
    `${label} page scrolls`,
    released && !result.stuck && !result.blocked && (result.y > 40 || result.body > 40),
    JSON.stringify(result),
  );
}

async function openSunday(page) {
  await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("html.boot-react").waitFor({ timeout: 10_000 });
}

async function openShop(page, width) {
  if (width >= 1024) await page.getByRole("button", { name: "Shop whole look" }).click();
  else await page.locator(".look-plate-shop").click();
  await page.locator(".look-sheet").waitFor({ timeout: 5_000 });
}

async function goHouses(page) {
  await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((node) => (node.textContent || "").trim() === "Houses");
    link?.click();
  });
  await page.waitForURL(/\/houses/, { timeout: 8_000 });
}

for (const [width, height] of [
  [390, 844],
  [834, 1112],
  [1024, 768],
  [1280, 800],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "en-GB" });
  const page = await ctx.newPage();
  const closes = [
    ["escape", async () => page.keyboard.press("Escape")],
    ["close", async () => page.getByRole("button", { name: "Close" }).click()],
    ["backdrop", async () => page.locator(".look-sheet-scrim").click({ position: { x: 8, y: 8 } })],
    ["route", async () => goHouses(page)],
  ];
  for (const [name, close] of closes) {
    await openSunday(page);
    await openShop(page, width);
    await close();
    if (name !== "route") {
      await page.waitForFunction(() => document.querySelectorAll(".look-sheet").length === 0, null, { timeout: 4_000 });
    }
    await assertScrollsAfterClose(page, `shop ${width} ${name}`);
  }
  if (width >= 1024) {
    const shareCloses = [
      ["escape", async () => page.keyboard.press("Escape")],
      ["close", async () => page.locator(".wide-share").getByRole("button", { name: "Close" }).click()],
      ["route", async () => goHouses(page)],
    ];
    for (const [name, close] of shareCloses) {
      await openSunday(page);
      await page.getByRole("button", { name: "Share" }).click();
      await page.locator(".wide-share").waitFor({ timeout: 5_000 });
      await close();
      if (name !== "route") {
        await page.waitForFunction(() => document.querySelectorAll(".wide-share").length === 0, null, { timeout: 4_000 });
      }
      await assertScrollsAfterClose(page, `share ${width} ${name}`);
    }
  }
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} smoothness check(s) failed`);
  process.exit(1);
}
console.log("\nsmoothness ok");
