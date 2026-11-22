#!/usr/bin/env node
/**
 * Guest shared links (#123).
 *
 * Signed out: a fresh context, no auth cookies, no localStorage.
 * sessionStorage looktag-boot-v1=done is set only because the style permalink
 * /houses/{label}/{collection}/{style} is not an isSharePath, so the boot
 * splash would cover it. Look, house, and line routes skip the splash on their own.
 *
 * This runner is plain node, not @playwright/test. fixme() is the local
 * equivalent of test.fixme: the case is reported and does not fail CI.
 * Real assertion failures still exit 1.
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { BOOT_SKIP_KEY, SCREENSHOT_DIR, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const LOOK_PATH = "/looks/seed-sunday-coat";
const HOUSE_PATH = "/houses/label-atelier-noir";
const LINE_PATH = "/houses/label-atelier-noir/kinkistyles";
const STYLE_PATH = "/houses/label-atelier-noir/kinkistyles/style-noir-column";
const MISSING_PATH = "/looks/guest-missing-look";
const PRICE_RE = /[$€£]\s?\d|\b\d{2,4}[.,]\d{2}\b/;
const PIN_SIGNAL_RE =
  /looktag\.funnel\.pin_tap|looktag\.funnel\.pin_open|looktag\.funnel\.pin_select|looktag\.ui\.pin|"pin_tap"/;

const iphone = devices["iPhone 12"] ?? devices["iPhone 13"];
const results = [];

function log(status, name, detail) {
  const label = status === "pass" ? "ok" : status === "fixme" ? "fixme" : "FAIL";
  console.log(`${label}  ${name}${detail ? ` - ${detail}` : ""}`);
}

function pass(name, detail = "") {
  results.push({ name, status: "pass", detail });
  log("pass", name, detail);
}

function fail(name, detail = "") {
  results.push({ name, status: "fail", detail });
  log("fail", name, detail);
}

function fixme(name, note, detail = "") {
  results.push({ name, status: "fixme", note, detail });
  log("fixme", name, `${note}${detail ? ` (${detail})` : ""}`);
}

function check(name, ok, detail = "") {
  if (ok) pass(name, detail);
  else fail(name, detail);
}

async function shot(page, name) {
  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e2e-guest-${name}.png`, fullPage: false });
  } catch {
    /* best effort */
  }
}

function phoneOptions() {
  return {
    viewport: { width: 390, height: 844 },
    userAgent: iphone.userAgent,
    deviceScaleFactor: iphone.deviceScaleFactor ?? 3,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
  };
}

function contextOptions(viewport) {
  if (viewport === "phone") return phoneOptions();
  if (viewport === "tablet") {
    return {
      viewport: { width: 834, height: 1194 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: true,
      locale: "en-GB",
    };
  }
  return {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    locale: "en-GB",
  };
}

async function readScroll(page) {
  return page.evaluate(() => {
    const main = document.querySelector("#native-main");
    const root = document.scrollingElement || document.documentElement;
    const mainRoom = main ? main.scrollHeight - main.clientHeight : 0;
    const pick = main && mainRoom > 8 ? main : root;
    return { top: pick.scrollTop || 0, room: pick.scrollHeight - pick.clientHeight };
  });
}

async function nudgeScroll(page) {
  await page.evaluate(() => {
    const main = document.querySelector("#native-main");
    const root = document.scrollingElement || document.documentElement;
    const mainRoom = main ? main.scrollHeight - main.clientHeight : 0;
    const pick = main && mainRoom > 8 ? main : root;
    const room = Math.max(0, pick.scrollHeight - pick.clientHeight);
    pick.scrollTop = Math.min(160, room);
  });
}

async function domClick(locator) {
  await locator.evaluate((el) => {
    if (el instanceof HTMLElement) el.click();
  });
}

async function openDirect(page, path) {
  const response = await page.goto(`${origin}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page
    .getByRole("navigation", { name: "App" })
    .waitFor({ timeout: 12_000 })
    .catch(() => {});
  return response?.status() ?? 0;
}

function signInWall(pathname) {
  return pathname === "/login" || pathname.startsWith("/login");
}

async function wallVisible(page) {
  const path = new URL(page.url()).pathname;
  if (signInWall(path)) return true;
  const heading = page.getByRole("heading", { name: /sign in/i });
  if ((await heading.count()) === 0) return false;
  return heading.first().isVisible().catch(() => false);
}

async function metaBag(page) {
  return page.evaluate(() => {
    const content = (selector) =>
      [...document.querySelectorAll(selector)].map((tag) => tag.getAttribute("content") || "").filter(Boolean);
    return {
      title: content('meta[property="og:title"]'),
      image: content('meta[property="og:image"]'),
      url: content('meta[property="og:url"]'),
      card: content('meta[name="twitter:card"]'),
    };
  });
}

function absoluteImageOk(image, pageUrl) {
  let img;
  try {
    img = new URL(image);
  } catch {
    return false;
  }
  if (img.protocol !== "http:" && img.protocol !== "https:") return false;
  if (!img.host) return false;
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    return false;
  }
  if (page.protocol === "https:" && img.protocol !== "https:") return false;
  return true;
}

async function assertShareMeta(page, viewport, kind, needle, path) {
  const name = `${viewport}.${kind}.og`;
  await page
    .waitForFunction(
      (text) =>
        [...document.querySelectorAll('meta[property="og:title"]')].some((tag) =>
          (tag.getAttribute("content") || "").includes(text),
        ),
      needle,
      { timeout: 10_000 },
    )
    .catch(() => {});
  const meta = await metaBag(page);
  const title = meta.title.find((value) => value.includes(needle)) || "";
  const image = meta.image.find((value) => /^https?:\/\//.test(value)) || meta.image[0] || "";
  const url = meta.url.find((value) => value.includes(path)) || "";
  const card = meta.card[0] || "";
  const ok =
    Boolean(title) &&
    absoluteImageOk(image, page.url()) &&
    url.includes(path) &&
    Boolean(card);
  check(
    name,
    ok,
    `title=${title || "-"} image=${image || "-"} url=${url || "-"} card=${card || "-"}`,
  );
}

function bodyHasLookView(body) {
  // The open navigation span ends on the next route, so a guest who stays on the
  // look is recorded as the looktag.ui.navigation metric with share kind "look".
  return body.includes("looktag.ui.navigation") && body.includes("looktag.share.kind") && body.includes('"s":"look"');
}

function bodyHasShopClick(body) {
  return (
    body.includes("looktag.funnel.shop_outbound_click") &&
    body.includes("looktag.funnel.user_state") &&
    body.includes("guest") &&
    body.includes("looktag.look.id") &&
    body.includes("seed-sunday-coat") &&
    body.includes("piece_shop")
  );
}

async function waitForBody(bodies, predicate, timeout = 6_000, from = 0) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (bodies.slice(from).some(predicate)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return bodies.slice(from).some(predicate);
}

async function photoBox(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll(".look-plate-canvas, .wide-plate-canvas")].find(
      (node) => node.getBoundingClientRect().width > 20 && node.getBoundingClientRect().height > 20,
    );
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: rect.width / rect.height, className: el.className };
  });
}

async function retailerHref(root) {
  return root.evaluate((node) => {
    const links = [...node.querySelectorAll("a[href]")];
    for (const link of links) {
      const raw = link.getAttribute("href") || "";
      if (!raw || raw.startsWith("#")) continue;
      let url;
      try {
        url = new URL(raw, location.origin);
      } catch {
        continue;
      }
      if (url.origin === location.origin) continue;
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (!url.hostname) continue;
      return url.href;
    }
    return "";
  });
}

async function guestGate(page, viewport, action, click) {
  const name = `${viewport}.${action}.gate`;
  const beforePath = new URL(page.url()).pathname;
  let before = await readScroll(page);
  if (before.top < 8) {
    await nudgeScroll(page);
    before = await readScroll(page);
  }
  await click();
  const gate = page.getByRole("heading", { name: /^Sign in to (save|follow)/ });
  const opened = await gate
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  const afterPath = new URL(page.url()).pathname;
  if (!opened) {
    fail(name, `no sign-in gate, url ${afterPath}`);
    await shot(page, name);
    return;
  }
  const heading = (await gate.first().innerText()).trim();
  await domClick(page.getByRole("button", { name: "Cancel", exact: true }).last());
  await gate
    .first()
    .waitFor({ state: "hidden", timeout: 4_000 })
    .catch(() => {});
  const stillOpen = await gate
    .first()
    .isVisible()
    .catch(() => false);
  const endPath = new URL(page.url()).pathname;
  const end = await readScroll(page);
  const urlOk = endPath === beforePath;
  const scrollOk = Math.abs(end.top - before.top) <= 8;
  if (stillOpen) {
    fail(name, `${heading} stayed open after Cancel`);
    await shot(page, name);
    return;
  }
  if (urlOk && scrollOk) {
    pass(name, `${heading}; cancel kept ${endPath}; scroll ${before.top} -> ${end.top}`);
  } else {
    fail(name, `${heading}; url ${beforePath} -> ${endPath}; scroll ${before.top} -> ${end.top}`);
    await shot(page, name);
  }
}

async function sharedLook(page, viewport, bodies) {
  const status = await openDirect(page, LOOK_PATH);
  await page
    .getByRole("heading", { name: "Sunday Coat" })
    .waitFor({ timeout: 12_000 })
    .catch(() => {});
  await page
    .locator(".tag-pin")
    .first()
    .waitFor({ state: "visible", timeout: 12_000 })
    .catch(() => {});
  await page
    .waitForFunction(() => {
      const img = document.querySelector(".look-plate-canvas img, .wide-plate-canvas img");
      return Boolean(img && img.complete && img.naturalWidth > 0);
    })
    .catch(() => {});

  const heading = (await page.getByRole("heading", { name: "Sunday Coat" }).count()) > 0;
  const pins = await page.locator(".tag-pin:visible").count();
  const box = await photoBox(page);
  const ratioOk = Boolean(box && box.ratio >= 0.7 && box.ratio <= 0.8);
  check(
    `${viewport}.look.photo-pins`,
    status < 400 && heading && pins > 0 && ratioOk,
    `status=${status} pins=${pins} ratio=${box ? box.ratio.toFixed(3) : "missing"} ${box ? `${box.width.toFixed(0)}x${box.height.toFixed(0)}` : ""}`,
  );
  if (!(status < 400 && heading && pins > 0 && ratioOk)) await shot(page, `${viewport}-look`);

  await assertShareMeta(page, viewport, "look", "Sunday Coat", LOOK_PATH);

  const viewOk = await waitForBody(bodies, bodyHasLookView, 8_000);
  check(
    `${viewport}.funnel.look-view`,
    viewOk,
    viewOk ? "ingest posted look navigation" : `no look-view ingest in ${bodies.length} bodies`,
  );

  const beforePin = bodies.length;
  await domClick(page.locator(".tag-pin").first());
  const sheet = page.locator(".look-sheet");
  const piece = page.locator(".look-plate-piece");
  const sheetFromPin = await sheet
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (sheetFromPin) {
    pass(`${viewport}.look.pin-opens-sheet`, "Shop this look opened from the pin");
  } else {
    const pieceOpen = await piece.isVisible().catch(() => false);
    const selectedRow = await page.locator(".wide-prow.is-on").count();
    fail(
      `${viewport}.look.pin-opens-sheet`,
      pieceOpen
        ? "selected-piece"
        : selectedRow > 0
          ? `selected-rows=${selectedRow}`
          : "sheet stayed closed",
    );
    await shot(page, `${viewport}-shop`);
    return;
  }

  await sheet.locator(".look-sheet-shop").first().waitFor({ timeout: 4_000 }).catch(() => {});

  const sheetText = (await sheet.innerText()).replace(/\s+/g, " ");
  check(
    `${viewport}.look.no-price`,
    !PRICE_RE.test(sheetText),
    sheetText.slice(0, 180),
  );

  const href = await retailerHref(sheet);
  const shopButton = sheet.getByRole("button", { name: "Shop Oversized Wool Coat" });
  const shopLink = sheet.locator('a[aria-label="Shop Oversized Wool Coat"]');
  const buttonCount = await shopButton.count();
  const linkCount = await shopLink.count();
  if (href) pass(`${viewport}.look.retailer-href`, href);
  else {
    fail(`${viewport}.look.retailer-href`, "no retailer href");
    await shot(page, `${viewport}-retailer`);
  }
  if (linkCount > 0) await domClick(shopLink.first());
  else if (buttonCount > 0) await domClick(shopButton.first());

  const pinSignal = await waitForBody(bodies, (body) => PIN_SIGNAL_RE.test(body), 4_500, beforePin);
  if (pinSignal) pass(`${viewport}.funnel.pin-tap`, "ingest posted a pin-tap signal");
  else {
    fail(
      `${viewport}.funnel.pin-tap`,
      `no pin-tap ingest in ${bodies.length - beforePin} new bodies`,
    );
  }

  const shopOk = await waitForBody(bodies, bodyHasShopClick);
  check(
    `${viewport}.funnel.shop-click`,
    shopOk,
    shopOk ? "shop_outbound_click guest" : `missing shop click in ${bodies.length} bodies`,
  );

  await domClick(sheet.getByRole("button", { name: "Close" }));
  await sheet.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});

  await guestGate(page, viewport, "save", () =>
    domClick(page.getByRole("button", { name: /Save look|^Save$/ }).first()),
  );
  await guestGate(page, viewport, "follow", () =>
    domClick(page.getByRole("button", { name: "Follow", exact: true }).first()),
  );
  await guestGate(page, viewport, "echo", () =>
    domClick(page.getByRole("button", { name: "Echo", exact: true }).first()),
  );
}

async function directPage(page, viewport, path, label, ready) {
  const name = `${viewport}.${label}.direct`;
  const status = await openDirect(page, path);
  await ready().catch(() => {});
  const pathNow = new URL(page.url()).pathname;
  const walled = await wallVisible(page);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const crashed = /Something went wrong|Application error/.test(text);
  check(
    name,
    status === 200 && pathNow === path && !walled && !crashed,
    `status=${status} path=${pathNow} wall=${walled} ${text.slice(0, 140)}`,
  );
  if (!(status === 200 && pathNow === path && !walled && !crashed)) await shot(page, name);
}

async function sharedHouses(page, viewport) {
  await directPage(page, viewport, HOUSE_PATH, "house", () =>
    page.getByRole("heading", { name: "Atelier Noir" }).waitFor({ timeout: 12_000 }),
  );
  await assertShareMeta(page, viewport, "house", "Atelier Noir", HOUSE_PATH);

  await directPage(page, viewport, LINE_PATH, "line", async () => {
    await page.getByText("Kinkistyles", { exact: true }).first().waitFor({ timeout: 12_000 });
    await page.getByText("Column Dress", { exact: true }).first().waitFor({ timeout: 12_000 });
  });

  await directPage(page, viewport, STYLE_PATH, "style", () =>
    page.getByRole("heading", { name: "Column Dress" }).waitFor({ timeout: 12_000 }),
  );
}

async function unknownLook(page, viewport) {
  const name = `${viewport}.look.not-found`;
  const status = await openDirect(page, MISSING_PATH);
  await page
    .getByRole("heading", { name: "Look not found" })
    .waitFor({ timeout: 12_000 })
    .catch(() => {});
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const heading = (await page.getByRole("heading", { name: "Look not found" }).count()) > 0;
  const deleted = text.includes("It may have been deleted.");
  const crashed = /Something went wrong|Application error|Internal Server Error/.test(text);
  if (status >= 500 || crashed || !heading || !deleted) {
    fail(name, `status=${status} heading=${heading} deleted=${deleted} ${text.slice(0, 160)}`);
    await shot(page, name);
    return;
  }
  pass(name, `status=${status}; Look not found, no crash`);
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext(contextOptions(viewport));
  await context.addInitScript((bootKey) => {
    try {
      sessionStorage.setItem(bootKey, "done");
    } catch {
      /* private mode */
    }
    window.__guestShopOpens = [];
    window.open = (url) => {
      window.__guestShopOpens.push(String(url ?? ""));
      return { opener: null, closed: false, focus() {}, close() {} };
    };
  }, BOOT_SKIP_KEY);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const bodies = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const body = request.postData() || "";
    if (!body) return;
    if (body.includes("looktag.") || body.includes("signals") || request.url().includes("ingestClientSignals")) {
      bodies.push(body);
    }
  });
  try {
    await sharedLook(page, viewport, bodies);
    await sharedHouses(page, viewport);
    await unknownLook(page, viewport);
  } catch (error) {
    fail(`${viewport}.suite`, error instanceof Error ? error.message : String(error));
    await shot(page, `${viewport}-throw`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, "phone");
  await runViewport(browser, "tablet");
  await runViewport(browser, "desktop");
} finally {
  await browser.close();
}

const failed = results.filter((row) => row.status === "fail");
const fixmes = results.filter((row) => row.status === "fixme");
const passed = results.filter((row) => row.status === "pass");
console.log(
  `\n${passed.length} pass, ${fixmes.length} fixme, ${failed.length} fail (${results.length} cases)`,
);
for (const row of fixmes) {
  console.log(`  fixme ${row.name}: ${row.note}`);
}
if (failed.length) {
  console.log("failed:", failed.map((row) => row.name).join(", "));
  console.log(`screenshots: ${SCREENSHOT_DIR}`);
  process.exit(1);
}
