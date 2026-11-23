#!/usr/bin/env node
/**
 * Analytics consent banner and /privacy.
 * Region comes from CF-IPCountry. GPC from Sec-GPC and navigator.globalPrivacyControl.
 * Start the app with a dummy VITE_POSTHOG_KEY so the gate is real.
 *
 *   VITE_POSTHOG_KEY=phc_ci_consent_not_real npm run dev
 *   BASE_URL=http://127.0.0.1:8080 npm run test:e2e:consent
 */
import { chromium } from "playwright";
import { BOOT_SKIP_KEY, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const LOOK = "/looks/seed-sunday-coat";
const results = [];

const EU_PHONE =
  "We'd like to use PostHog analytics, hosted in the EU, to see which looks get used. No ad trackers, no selling data. Nothing runs unless you accept.";
const EU_WIDE =
  "We'd like to use PostHog analytics, hosted in the EU, to see which looks and pages get used so we can improve Looktag. No ad trackers, and we don't sell your data. Nothing is collected unless you accept.";
const US_PHONE =
  "We use PostHog analytics, hosted in the EU, to see which looks get used. No ad trackers; we don't sell or share your data. Opt out any time.";
const US_WIDE =
  "Looktag uses PostHog analytics, hosted in the EU, to see which looks and pages get used. No ad trackers, and we don't sell or share your data. You can opt out now or any time in Privacy choices.";
const ROW_PHONE =
  "We use PostHog analytics, hosted in the EU, to see which looks get used. No ad trackers, and we don't sell your data. Opt out any time.";
const ROW_WIDE =
  "Looktag uses PostHog analytics, hosted in the EU, to see which looks and pages get used. No ad trackers, and we don't sell your data. You can opt out now or any time in Privacy choices.";
const GPC_PHONE =
  "Your browser's privacy signal is on, so analytics is off. Nothing is collected. You can change this in Privacy choices.";
const GPC_WIDE =
  "Your browser's privacy signal is on, so analytics is off. Nothing is collected. You can change this any time in Privacy choices.";
const INDIA_LEAD =
  "With your consent, Looktag uses PostHog analytics, hosted in the EU, only to understand how Looktag is used and improve it. We'd collect:";
const INDIA_ITEMS = [
  "Pages and looks you open",
  "Taps like Save, Follow, Shop and Share",
  "Device type, browser, screen size and page speed",
  "Your Looktag account ID if signed in, never your name or email",
];

function log(status, name, detail) {
  const label = status === "pass" ? "ok" : "FAIL";
  console.log(`${label}  ${name}${detail ? ` - ${detail}` : ""}`);
}

function pass(name, detail = "") {
  results.push({ name, status: "pass" });
  log("pass", name, detail);
}

function fail(name, detail = "") {
  results.push({ name, status: "fail" });
  log("fail", name, detail);
}

function check(name, ok, detail = "") {
  if (ok) pass(name, detail);
  else fail(name, detail);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function session(browser, { width, height, country, gpc = false }) {
  const headers = {};
  if (country) headers["CF-IPCountry"] = country;
  if (gpc) headers["Sec-GPC"] = "1";
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "en-GB",
    extraHTTPHeaders: headers,
  });
  await context.addInitScript((bootKey) => {
    try {
      sessionStorage.setItem(bootKey, "done");
    } catch {
      /* ignore */
    }
  }, BOOT_SKIP_KEY);
  if (gpc) {
    await context.addInitScript(() => {
      try {
        Object.defineProperty(Navigator.prototype, "globalPrivacyControl", {
          configurable: true,
          get() {
            return true;
          },
        });
      } catch {
        /* ignore */
      }
    });
  }
  const hits = [];
  await context.route(/\/ingest|posthog\.com/i, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  return { context, hits };
}

async function open(context, path) {
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  let last = "goto";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      last = "goto";
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      last = "screen";
      await page.waitForSelector("#native-screen", { timeout: 30_000 });
      last = "ready";
      await page.waitForFunction(() => document.documentElement.dataset.routeReady === "true", null, {
        timeout: 30_000,
      });
      return page;
    } catch (error) {
      if (attempt === 1) {
        error.message = `${path} failed at ${last}: ${error.message}`;
        throw error;
      }
      await sleep(500);
    }
  }
  return page;
}

async function bannerText(page) {
  const banner = page.locator("[data-consent-banner]");
  await banner.first().waitFor({ state: "visible", timeout: 20_000 });
  return banner.first().innerText();
}

async function waitForHits(hits, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (hits.length > 0) return true;
    await sleep(200);
  }
  return hits.length > 0;
}

async function readChrome(page) {
  return page.evaluate(() => {
    function point(el) {
      if (!el) return { missing: true };
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return { hidden: true, w: rect.width, h: rect.height };
      const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const top = document.elementFromPoint(x, y);
      return {
        w: rect.width,
        h: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        covered: Boolean(top && !el.contains(top)),
      };
    }
    const banner = document.querySelector("[data-consent-banner]");
    const box = banner ? banner.getBoundingClientRect() : null;
    const pins = [...document.querySelectorAll(".tag-pin")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const shops = [...document.querySelectorAll("button")].filter((el) => {
      const text = (el.textContent || "").trim();
      return text === "Shop" || text === "Shop whole look";
    });
    const tab = document.querySelector("nav.tab-bar");
    return {
      id: banner ? banner.getAttribute("data-consent-banner") : "",
      region: document.documentElement.dataset.ltRegion || "",
      box: box
        ? { w: box.width, h: box.height, left: box.left, top: box.top, bottom: box.bottom }
        : null,
      pins: pins.map(point),
      shops: shops.map((el) => ({
        ...point(el),
        inBanner: Boolean(el.closest("[data-consent-banner]")),
        text: (el.textContent || "").trim(),
      })),
      tab: point(tab),
      barH: document.querySelector(".wide-lookbar")?.getBoundingClientRect().height ?? null,
      chrome: document.documentElement.dataset.chrome || "",
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await layoutAndCopy(browser);
    await euGate(browser);
    await usNotice(browser);
    await gpcPath(browser);
    await indiaLook(browser);
    await footerAndPrivacy(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((row) => row.status === "fail");
  console.log(`consent e2e ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

async function layoutAndCopy(browser) {
  const phone = await session(browser, { width: 390, height: 844, country: "DE" });
  try {
    const feed = await open(phone.context, "/");
    const text = await bannerText(feed);
    check("phone EU title", text.includes("Can we use analytics?"));
    check("phone EU body", text.includes(EU_PHONE), text.slice(0, 180));
    check("phone EU no share wording", !text.includes("or share"));
    const geo = await readChrome(feed);
    check("phone region eu", geo.region === "eu", geo.region);
    check("phone feed dock", geo.id === "feed", geo.id);
    check("phone dock above tab", geo.box && geo.tab.top != null && geo.box.bottom <= geo.tab.top + 1, JSON.stringify({ box: geo.box, tab: geo.tab }));
    check("phone tab not covered", geo.tab.missing || geo.tab.hidden || geo.tab.covered === false, JSON.stringify(geo.tab));
    await feed.close();

    const look = await open(phone.context, LOOK);
    await look.locator('[data-consent-banner="look"]').waitFor({ state: "visible" });
    const lookText = await look.locator('[data-consent-banner="look"]').innerText();
    check("phone look line", lookText.includes("PostHog analytics (EU), only if you accept."));
    check("phone look details", lookText.includes("Details"));
    const metrics = await readChrome(look);
    check("phone look dock 166", metrics.box && Math.abs(metrics.box.h - 166) < 1.5, JSON.stringify(metrics.box));
    const plateShops = metrics.shops.filter((shop) => shop.text === "Shop" && !shop.inBanner && !shop.hidden && !shop.missing);
    const dockShops = metrics.shops.filter((shop) => shop.text === "Shop" && shop.inBanner && !shop.hidden && !shop.missing);
    check("plate shop hidden while dock is up", plateShops.length === 0, JSON.stringify(metrics.shops));
    check("dock shop visible", dockShops.length === 1, JSON.stringify(metrics.shops));
    check("dock shop not covered", dockShops.every((shop) => shop.covered === false));
    check("pins not covered", metrics.pins.length > 0 && metrics.pins.every((pin) => pin.covered === false), `pins ${metrics.pins.length}`);
    check("look tab not covered", metrics.tab.covered === false);

    await look.locator("[data-consent-shop]").click();
    await look.locator(".look-sheet").waitFor({ state: "visible" });
    check("banner hides while shop sheet is open", (await look.locator("[data-consent-banner]").count()) === 0);
    await look.locator(".look-sheet-x").click();
    await look.locator('[data-consent-banner="look"]').waitFor({ state: "visible" });
    check("banner returns after shop sheet closes", true);

    await look.locator('[data-consent-banner="look"] button', { hasText: "Decline" }).click();
    await look.locator('[data-consent-banner="look"]').waitFor({ state: "detached", timeout: 10_000 });
    const after = await readChrome(look);
    const plateBack = after.shops.filter((shop) => shop.text === "Shop" && !shop.inBanner && !shop.hidden && !shop.missing);
    check("plate shop returns after choice", plateBack.length === 1, JSON.stringify(after.shops));
    await look.close();
  } finally {
    await phone.context.close();
  }

  const tablet = await session(browser, { width: 834, height: 1112, country: "US" });
  try {
    const feed = await open(tablet.context, "/");
    await feed.locator('[data-consent-banner="card"]').waitFor({ state: "visible" });
    const text = await feed.locator('[data-consent-banner="card"]').innerText();
    check("tablet US title", text.includes("We use analytics"));
    check("tablet US body", text.includes(US_WIDE));
    const card = await readChrome(feed);
    check("tablet card 400", card.box && Math.abs(card.box.w - 400) < 2, JSON.stringify(card.box));
    check("tablet card bottom left", card.box && card.box.left < 48 && card.box.bottom > 1000, JSON.stringify(card.box));
    await feed.close();

    const look = await open(tablet.context, LOOK);
    await look.locator('[data-consent-banner="strip"]').waitFor({ state: "visible" });
    check("tablet look has no card", (await look.locator('[data-consent-banner="card"]').count()) === 0);
    const strip = await readChrome(look);
    check("tablet strip 60", strip.box && Math.abs(strip.box.h - 60) < 1.5, JSON.stringify(strip.box));
    check("tablet look bar 64", strip.barH != null && Math.abs(strip.barH - 64) < 1.5, String(strip.barH));
    const shopCovered = strip.shops.some((shop) => shop.covered);
    check("tablet shop not covered", strip.shops.length > 0 && !shopCovered, JSON.stringify(strip.shops));
    check("tablet pins not covered", strip.pins.length > 0 && strip.pins.every((pin) => !pin.covered), `pins ${strip.pins.length}`);
    await look.close();
  } finally {
    await tablet.context.close();
  }

  const desktop = await session(browser, { width: 1280, height: 800, country: "AU" });
  try {
    const feed = await open(desktop.context, "/");
    await feed.locator('[data-consent-banner="card"]').waitFor({ state: "visible" });
    const text = await feed.locator('[data-consent-banner="card"]').innerText();
    check("desktop ROW body", text.includes(ROW_WIDE));
    check("desktop ROW omits or share", !text.includes("or share"));
    const card = await readChrome(feed);
    check("desktop card 400", card.box && Math.abs(card.box.w - 400) < 2, JSON.stringify(card.box));
    check("desktop card left", card.box && card.box.left < 48, JSON.stringify(card.box));
    await feed.close();

    const look = await open(desktop.context, LOOK);
    await look.locator('[data-consent-banner="strip"]').waitFor({ state: "visible" });
    const stripText = await look.locator('[data-consent-banner="strip"]').innerText();
    check("desktop strip privacy link", stripText.includes("Privacy policy"));
    check("desktop look has no card", (await look.locator('[data-consent-banner="card"]').count()) === 0);
    await look.close();
  } finally {
    await desktop.context.close();
  }

  const undetected = await session(browser, { width: 390, height: 844 });
  try {
    const page = await open(undetected.context, "/");
    const text = await bannerText(page);
    const region = await page.evaluate(() => document.documentElement.dataset.ltRegion);
    check("missing country is opt-in", region === "eu" && text.includes("Can we use analytics?"), region);
    await page.close();
  } finally {
    await undetected.context.close();
  }
}

async function euGate(browser) {
  const { context, hits } = await session(browser, { width: 390, height: 844, country: "DE" });
  try {
    const page = await open(context, "/");
    await bannerText(page);
    await sleep(1500);
    check("EU before choice sends nothing", hits.length === 0, String(hits.length));
    await page.locator("[data-consent-banner] button", { hasText: "Decline" }).click();
    await page.locator("[data-consent-banner]").waitFor({ state: "detached" });
    await sleep(500);
    const cookies = await context.cookies();
    const consent = cookies.find((cookie) => cookie.name === "lt_consent");
    const basis = cookies.find((cookie) => cookie.name === "lt_consent_basis");
    check("decline sets denied explicit", consent?.value === "denied" && basis?.value === "explicit", `lt_consent=${consent?.value} basis=${basis?.value}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#native-screen");
    await sleep(800);
    check("declined reload hides banner", (await page.locator("[data-consent-banner]").count()) === 0);
    check("declined reload still sends nothing", hits.length === 0, String(hits.length));
    await page.close();
  } finally {
    await context.close();
  }
}

async function usNotice(browser) {
  const early = await session(browser, { width: 1280, height: 800, country: "US" });
  try {
    const page = await open(early.context, "/");
    await page.locator('[data-consent-banner="card"]').waitFor({ state: "visible" });
    await sleep(400);
    check("US before seen sends nothing", early.hits.length === 0, String(early.hits.length));
    await page.locator("[data-consent-banner] button", { hasText: "Opt out" }).click();
    await page.locator("[data-consent-banner]").waitFor({ state: "detached" });
    await sleep(1500);
    check("US opt out keeps zero requests", early.hits.length === 0, String(early.hits.length));
    const cookies = await early.context.cookies();
    check(
      "opt out cookie is denied explicit",
      cookies.some((cookie) => cookie.name === "lt_consent" && cookie.value === "denied") &&
        cookies.some((cookie) => cookie.name === "lt_consent_basis" && cookie.value === "explicit"),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(600);
    check("opt out persists on reload", (await page.locator("[data-consent-banner]").count()) === 0);
    await page.close();
  } finally {
    await early.context.close();
  }

  const seen = await session(browser, { width: 1280, height: 800, country: "US" });
  try {
    const page = await open(seen.context, "/");
    await page.locator('[data-consent-banner="card"]').waitFor({ state: "visible" });
    const started = seen.hits.length;
    const loaded = await waitForHits(seen.hits, 8000);
    check("US seen may load analytics", loaded && seen.hits.length > started);
    const cookies = await seen.context.cookies();
    check(
      "seen cookie is granted notice",
      cookies.some((cookie) => cookie.name === "lt_consent" && cookie.value === "granted") &&
        cookies.some((cookie) => cookie.name === "lt_consent_basis" && cookie.value === "notice"),
    );
    check("banner stays up after seen so opt out is still there", (await page.locator("[data-consent-banner]").count()) === 1);
    await page.close();
  } finally {
    await seen.context.close();
  }
}

async function gpcPath(browser) {
  const { context, hits } = await session(browser, { width: 390, height: 844, country: "US", gpc: true });
  try {
    const page = await open(context, "/");
    const text = await bannerText(page);
    check("GPC title", text.includes("Analytics is off"));
    check("GPC phone body", text.includes(GPC_PHONE));
    await sleep(1500);
    check("GPC sends nothing", hits.length === 0, String(hits.length));
    await page.locator("[data-consent-banner] button", { hasText: "OK" }).click();
    await page.locator("[data-consent-banner]").waitFor({ state: "detached" });
    await sleep(400);
    check("GPC OK stays off", hits.length === 0);
    const cookies = await context.cookies();
    check(
      "GPC OK stores denied gpc",
      cookies.some((cookie) => cookie.name === "lt_consent" && cookie.value === "denied") &&
        cookies.some((cookie) => cookie.name === "lt_consent_basis" && cookie.value === "gpc"),
    );
    await page.locator("[data-footer-link='privacy-choices']").scrollIntoViewIfNeeded();
    await page.locator("[data-footer-link='privacy-choices']").click();
    const dialog = page.getByRole("dialog", { name: "Privacy choices" });
    await dialog.waitFor();
    await dialog.getByRole("radio", { name: "On", exact: true }).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const allowed = await waitForHits(hits, 8000);
    check("explicit On after GPC may load analytics", allowed);
    await page.close();
  } finally {
    await context.close();
  }
}

async function indiaLook(browser) {
  const { context, hits } = await session(browser, { width: 390, height: 844, country: "IN" });
  try {
    const look = await open(context, LOOK);
    await look.locator('[data-consent-banner="look"]').waitFor({ state: "visible" });
    const compact = await look.locator('[data-consent-banner="look"]').innerText();
    check("India compact line", compact.includes("Analytics (PostHog, EU) only with your consent."));
    check("India compact has Review", compact.includes("Review"));
    check("India compact has Decline", compact.includes("Decline"));
    check("India compact has no Accept", !compact.split("\n").includes("Accept"));
    await sleep(800);
    check("India before accept sends nothing", hits.length === 0);
    await look.locator('[data-consent-banner="look"] button', { hasText: "Review" }).click();
    const dialog = look.getByRole("dialog", { name: "Your consent for analytics" });
    await dialog.waitFor();
    const full = await dialog.innerText();
    check("India notice lead", full.includes(INDIA_LEAD));
    for (const item of INDIA_ITEMS) check(`India item ${item.slice(0, 24)}`, full.includes(item));
    check("India Accept is on the notice", full.includes("Accept"));
    await dialog.getByRole("button", { name: "Accept" }).click();
    const allowed = await waitForHits(hits, 8000);
    check("India accept may load analytics", allowed);
    await look.close();

    const feed = await session(browser, { width: 390, height: 844, country: "IN" });
    try {
      const page = await open(feed.context, "/");
      const text = await bannerText(page);
      check("India feed is itemised", INDIA_ITEMS.every((item) => text.includes(item)) && text.includes(INDIA_LEAD));
      check("India feed Accept", text.includes("Accept"));
      await page.close();
    } finally {
      await feed.context.close();
    }
  } finally {
    await context.close();
  }
}

async function footerAndPrivacy(browser) {
  for (const vp of [
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "desktop", width: 1280, height: 800 },
  ]) {
    const { context } = await session(browser, { width: vp.width, height: vp.height, country: "DE" });
    try {
      const page = await open(context, "/");
      await page.locator("[data-footer-link='privacy']").scrollIntoViewIfNeeded();
      const labels = await page.locator(".site-footer-list li").allInnerTexts();
      check(`${vp.name} footer starts with Privacy`, labels[0]?.trim() === "Privacy", labels.join(" | "));
      check(`${vp.name} footer Privacy choices second`, labels[1]?.trim() === "Privacy choices", labels.join(" | "));
      const decline = page.locator("[data-consent-banner] button", { hasText: "Decline" });
      if (await decline.count()) await decline.click();
      await page.locator("[data-footer-link='privacy']").click();
      await page.waitForURL(/\/privacy$/, { timeout: 20_000 });
      check(`${vp.name} privacy is not a 404`, !(await page.locator("body").innerText()).includes("Look not found"));
      await page.close();
    } finally {
      await context.close();
    }
  }

  const phone = await session(browser, { width: 390, height: 844, country: "DE" });
  try {
    const you = await open(phone.context, "/login");
    await you.locator(".you-privacy-row").waitFor({ state: "visible" });
    const row = await you.locator(".you-privacy-row").innerText();
    check("phone You privacy row", row.includes("Privacy choices") && row.includes("Analytics off"));
    const box = await you.locator(".you-privacy-row").boundingBox();
    check("phone You row height 52", box && Math.abs(box.height - 52) < 1.5, JSON.stringify(box));
    await you.close();
  } finally {
    await phone.context.close();
  }

  const wide = await session(browser, { width: 1280, height: 800, country: "DE" });
  try {
    const you = await open(wide.context, "/login");
    await you.locator(".you-home, .you-privacy").first().waitFor({ timeout: 20_000 });
    const display = await you.locator(".you-privacy").evaluate((el) => getComputedStyle(el).display).catch(() => "missing");
    check("wide You hides privacy row", display === "none", display);
    await you.close();

    const privacy = await open(wide.context, "/privacy");
    await privacy.locator("[data-testid='legal-privacy']").waitFor();
    check("privacy has no banner", (await privacy.locator("[data-consent-banner]").count()) === 0);
    const body = await privacy.locator("[data-testid='legal-privacy']").innerText();
    for (const token of ["[LEGAL NAME]", "[POSTAL ADDRESS]", "[PUBLISH DATE]", "[MINIMUM AGE]", "[RETENTION]", "[verify]"]) {
      check(`privacy shows ${token}`, body.includes(token));
    }
    check("privacy contact email", body.includes("hello@thelooktag.com"));
    check("privacy heading", body.includes("Who we are") && body.includes("Privacy choices"));
    const ids = await privacy.locator(".privacy-article h2").evaluateAll((nodes) => nodes.map((node) => node.id));
    check(
      "privacy section ids",
      ["who", "collect", "bases", "processors", "shop", "cookies", "retention", "rights", "choices", "children", "changes", "contact"].every((id) => ids.includes(id)),
      ids.join(","),
    );
    await privacy.getByRole("button", { name: "Open Privacy choices" }).click();
    await privacy.getByRole("dialog", { name: "Privacy choices" }).waitFor();
    check("privacy page opens choices", true);
    await privacy.close();
  } finally {
    await wide.context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
