#!/usr/bin/env node
/**
 * Saved page lists a look and a House design after Save.
 * Phone, tablet, and desktop. Guest and signed in.
 * Newest first, reload, unsave, and guest carry-over without a duplicate.
 */
import { chromium } from "playwright";
import { resolveAdminCredentials, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1194 },
  { name: "desktop", width: 1280, height: 800 },
];
const HOUSE = "house-noir-column";
const LOOK = "seed-sunday-coat";
const HOUSE_TITLE = "Noir Column";
const LOOK_TITLE = "Sunday Coat";

let failed = false;
function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.routeReady === "true", null, {
    timeout: 20_000,
  });
}

async function saveLook(page, id) {
  await page.goto(`${origin}/looks/${id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await ready(page);
  const save = page.getByRole("button", { name: /^Save( look)?$/ }).first();
  await save.waitFor({ timeout: 15_000 });
  await save.click();
  await page.waitForFunction(
    (lookId) => {
      try {
        return JSON.parse(localStorage.getItem("looktag-saved-v1") ?? "[]").includes(lookId);
      } catch {
        return false;
      }
    },
    id,
    { timeout: 8_000 },
  );
  const opened = await page
    .locator("[data-vaul-drawer]")
    .waitFor({ state: "visible", timeout: 2_500 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await page.keyboard.press("Escape");
    await page.locator("[data-vaul-drawer]").waitFor({ state: "hidden", timeout: 4_000 }).catch(() => {});
  }
  return opened;
}

async function unsaveLook(page, id) {
  await page.goto(`${origin}/looks/${id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await ready(page);
  const button = page.getByRole("button", { name: /^(Saved|Remove saved look)$/ }).first();
  await button.waitFor({ timeout: 10_000 });
  await button.click();
  await page.waitForFunction(
    (lookId) => {
      try {
        return !JSON.parse(localStorage.getItem("looktag-saved-v1") ?? "[]").includes(lookId);
      } catch {
        return false;
      }
    },
    id,
    { timeout: 8_000 },
  );
}

async function cardTitles(page) {
  await ready(page);
  await page.waitForTimeout(500);
  return page.evaluate(() =>
    [...document.querySelectorAll(".you-grid .you-hangtag-name")].map((el) => (el.textContent ?? "").trim()),
  );
}

async function openYou(page) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  return cardTitles(page);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of widths) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("looktag-style-guide-v1", "done");
        localStorage.setItem("looktag-browse-coach-v1", "done");
        sessionStorage.setItem("looktag-boot-v1", "done");
      } catch {
        /* private mode */
      }
    });
    const page = await context.newPage();
    const houseSheet = await saveLook(page, HOUSE);
    const lookSheet = await saveLook(page, LOOK);
    record(`${viewport.name}.guest-sheet`, houseSheet && lookSheet, `house=${houseSheet} look=${lookSheet}`);
    const immediate = await openYou(page);
    record(
      `${viewport.name}.immediate`,
      immediate[0] === LOOK_TITLE && immediate[1] === HOUSE_TITLE && immediate.length === 2,
      immediate.join(", "),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloaded = await cardTitles(page);
    record(`${viewport.name}.reload`, reloaded.join("|") === `${LOOK_TITLE}|${HOUSE_TITLE}`, reloaded.join(", "));

    await unsaveLook(page, LOOK);
    const after = await openYou(page);
    record(`${viewport.name}.unsave`, after.length === 1 && after[0] === HOUSE_TITLE, after.join(", "));
    await page.reload({ waitUntil: "domcontentloaded" });
    const afterReload = await cardTitles(page);
    record(`${viewport.name}.unsave-reload`, afterReload.length === 1 && afterReload[0] === HOUSE_TITLE, afterReload.join(", "));

    await page.evaluate(() => {
      const ids = JSON.parse(localStorage.getItem("looktag-saved-v1") ?? "[]");
      localStorage.setItem("looktag-saved-v1", JSON.stringify(["deleted-look-xyz", ...ids]));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await page.waitForTimeout(700);
    const skipped = await page.evaluate(() => ({
      titles: [...document.querySelectorAll(".you-grid .you-hangtag-name")].map((el) => (el.textContent ?? "").trim()),
      hrefs: [...document.querySelectorAll(".you-grid a")].map((el) => el.getAttribute("href") ?? ""),
    }));
    record(
      `${viewport.name}.skip-deleted`,
      skipped.titles.length === 1 &&
        skipped.titles[0] === HOUSE_TITLE &&
        skipped.hrefs.every((href) => !href.includes("deleted-look")),
      JSON.stringify(skipped),
    );

    await page.getByRole("tab", { name: "Profile" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.waitForURL(/\/login\?/, { timeout: 15_000 });
    await page.locator("form[data-hydrated='true']").waitFor({ timeout: 10_000 });
    const { email, password } = resolveAdminCredentials();
    await page.locator("#creator-email").fill(email);
    await page.locator("#creator-password").fill(password);
    await page.locator("form").getByRole("button", { name: "Sign in with email" }).click();
    await page.waitForURL((url) => url.pathname === "/login" && url.search === "", { timeout: 20_000 });
    const carried = await cardTitles(page);
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("looktag-saved-v1") ?? "[]"));
    record(
      `${viewport.name}.carry-over`,
      carried.length === 1 && carried[0] === HOUSE_TITLE && ids.filter((id) => id === HOUSE).length === 1,
      `${carried.join(", ")} ids=${ids.join(",")}`,
    );

    const signedSheet = await saveLook(page, LOOK);
    const signedTitles = await openYou(page);
    record(
      `${viewport.name}.signed-in`,
      signedSheet === false && signedTitles[0] === LOOK_TITLE && signedTitles[1] === HOUSE_TITLE && signedTitles.length === 2,
      `sheet=${signedSheet} ${signedTitles.join(", ")}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
