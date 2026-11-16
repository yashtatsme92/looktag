#!/usr/bin/env node
/**
 * Look detail fixes: tablet Shop whole look stays on the sheet, seeded creator
 * pages resolve, piece thumbs centre on the pin, Sun-Bleached Linen accounts
 * for every pin, and pins are a 28px mark with no pulse.
 * Also: at 820 every Sunday Coat pin, and at 834 every pin on every seeded
 * look, selects its matching piece in the wide shop panel.
 * Ghost wide-panel Shop buttons at 1024 and 1112 (1280 stays solid).
 */
import { chromium } from "playwright";
import { SEED_LOOKS } from "../../src/lib/looks/seed.ts";
import { EDITORIAL_USER_ID } from "../../src/lib/looks/types.ts";
import { pieceThumbCrop } from "../../src/lib/looks/piece-thumb.ts";
import { resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const SUN = "seed-sofia-sun-bleached-linen";
const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "tablet834", width: 834, height: 1194 },
  { name: "wide1024", width: 1024, height: 768 },
  { name: "wide1112", width: 1112, height: 834 },
  { name: "desktop", width: 1280, height: 800 },
];
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Every visible pin selects the piece row with the matching pin number. */
async function assertWidePinRows(page, label) {
  const count = await page.locator(".tag-pin").count();
  record(`${label}.pins`, count > 0, String(count));
  for (let index = 0; index < count; index += 1) {
    const pin = page.locator(".tag-pin").nth(index);
    const pinNumber = (await pin.locator(".tag-pin-dot").innerText()).trim();
    await pin.click();
    const selectedRow = page.locator(
      `.wide-prow.is-on .wide-prow-hit[aria-label^="Spotlight piece ${pinNumber},"]`,
    );
    const selected = await selectedRow.waitFor({ timeout: 6_000 }).then(() => true).catch(() => false);
    record(
      `${label}.pin${index}-selects-row`,
      selected && (await page.locator(".wide-prow.is-on").count()) === 1,
      `pin=${pinNumber}`,
    );
  }
}

async function openLook(page, id) {
  const url = `${origin}/looks/${id}`;
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.locator(".tag-pin, .pin-more").first().waitFor({ timeout: 20_000 });
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

async function prime(context) {
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("looktag-boot-v1", "done");
      localStorage.setItem("looktag-style-guide-v1", "done");
      localStorage.setItem("looktag-browse-coach-v1", "done");
    } catch {
      /* private mode */
    }
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await prime(context);
  const page = await context.newPage();

  const creatorIds = [...new Set(SEED_LOOKS.map((look) => look.userId)), EDITORIAL_USER_ID];
  for (const userId of creatorIds) {
    const response = await page.request.get(`${origin}/creators/${userId}`);
    const html = await response.text();
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
    record(
      `creator.${userId}.200`,
      response.status() === 200 && !/Creator not found/i.test(title),
      `${response.status()} ${title}`,
    );
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}/creators/${SEED_LOOKS.find((look) => look.creator === "Sofia Brandt").userId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Sofia Brandt" }).waitFor({ timeout: 12_000 });
  const sofiaText = await page.locator("body").innerText();
  record("creator.sofia.looks", /Sun-Bleached Linen/.test(sofiaText) && !/Creator not found/.test(sofiaText));

  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/looks/${SUN}`, { waitUntil: "domcontentloaded" });
    await page.locator(".tag-pin, .pin-more").first().waitFor({ timeout: 12_000 });
    await page.waitForTimeout(400);
    const pins = await page.evaluate(() => {
      const dots = [...document.querySelectorAll(".tag-pin-dot")].map((dot) => {
        const style = getComputedStyle(dot);
        const box = dot.getBoundingClientRect();
        return {
          w: Math.round(box.width),
          h: Math.round(box.height),
          animation: style.animationName,
          iteration: style.animationIterationCount,
        };
      });
      const chip = document.querySelector(".pin-more")?.textContent?.trim() ?? "";
      const extra = Number(chip.match(/\+(\d+)/)?.[1] ?? 0);
      return { visible: document.querySelectorAll("[data-tag-pin]").length, extra, dots, chip };
    });
    record(
      `pins.${viewport.name}.accounted`,
      pins.visible + pins.extra === 4 && pins.visible > 0,
      JSON.stringify(pins),
    );
    record(
      `pins.${viewport.name}.size`,
      pins.dots.length === pins.visible && pins.dots.every((dot) => dot.w === 28 && dot.h === 28 && dot.iteration !== "infinite" && dot.animation !== "pin-pulse"),
      JSON.stringify(pins.dots),
    );
  }

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded" });
  await page.locator(".wide-prow-hit").first().waitFor({ timeout: 12_000 });
  await page.locator(".tag-pin").nth(1).click();
  await page.locator('.wide-prow.is-on .wide-prow-hit[aria-label^="Spotlight piece 2,"]').waitFor({ timeout: 6_000 });
  record(
    "tablet.wide-panel-pin-selects-piece",
    (await page.locator(".wide-prow.is-on").count()) === 1,
  );
  await page.locator(".wide-panel-ft button").click();
  await page.locator(".look-sheet").waitFor({ timeout: 6_000 });
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".look-sheet-row")];
    const shops = [...document.querySelectorAll(".look-sheet-shop")];
    return {
      rows: rows.length,
      shops: shops.length,
      thumbs: document.querySelectorAll(".look-sheet-thumb").length,
      whole: Boolean(document.querySelector(".look-sheet-whole")),
      ghost: shops.every((button) => {
        const style = getComputedStyle(button);
        return style.backgroundColor === "rgba(0, 0, 0, 0)" && style.color === "rgb(17, 17, 17)";
      }),
    };
  });
  record(
    "tablet.wide-sheet-lists-pieces",
    sheet.rows === 4 && sheet.shops === 4 && sheet.thumbs === 4 && sheet.ghost && !sheet.whole,
    JSON.stringify(sheet),
  );

  await page.setViewportSize({ width: 834, height: 1194 });
  for (const look of SEED_LOOKS) {
    await openLook(page, look.id);
    await page.locator(".wide-prow-hit").first().waitFor({ timeout: 12_000 });
    await assertWidePinRows(page, `tablet834.${look.id}`);
  }

  for (const viewport of [
    { name: "wide1024", width: 1024, height: 768 },
    { name: "wide1112", width: 1112, height: 834 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded" });
    await page.locator(".wide-prow .wide-btn-primary").first().waitFor({ timeout: 12_000 });
    const ghost = await page.evaluate(() =>
      [...document.querySelectorAll(".wide-prow .wide-btn-primary")].map((button) => {
        const style = getComputedStyle(button);
        return {
          background: style.backgroundColor,
          color: style.color,
          border: style.borderTopColor,
        };
      }),
    );
    record(
      `${viewport.name}.shop-ghost`,
      ghost.length >= 1 &&
        ghost.every((button) => button.background === "rgba(0, 0, 0, 0)" && button.color === "rgb(17, 17, 17)" && button.border === "rgb(17, 17, 17)"),
      JSON.stringify(ghost),
    );
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}/looks/${SUN}`, { waitUntil: "domcontentloaded" });
  await page.locator(".wide-pth").first().waitFor({ timeout: 10_000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll(".wide-pth")].some((node) => node.getAttribute("data-crop-w")),
    null,
    { timeout: 8_000 },
  );
  const thumbs = await page.evaluate(() =>
    [...document.querySelectorAll(".wide-prow")].map((row) => {
      const thumb = row.querySelector(".wide-pth");
      return {
        name: row.querySelector(".wide-pnm")?.textContent ?? "",
        x: Number(thumb?.getAttribute("data-pin-x")),
        y: Number(thumb?.getAttribute("data-pin-y")),
        left: Number(thumb?.getAttribute("data-crop-left")),
        top: Number(thumb?.getAttribute("data-crop-top")),
        width: Number(thumb?.getAttribute("data-crop-w")),
        height: Number(thumb?.getAttribute("data-crop-h")),
        thumb: thumb?.clientWidth ?? 0,
        nw: thumb?.querySelector("img")?.naturalWidth ?? 0,
        nh: thumb?.querySelector("img")?.naturalHeight ?? 0,
        shopClass: row.querySelector(".wide-prow-acts button")?.className ?? "",
      };
    }),
  );
  const sandals = thumbs.find((row) => /Arizona sandals/.test(row.name));
  const expected = sandals
    ? pieceThumbCrop({ imageWidth: sandals.nw, imageHeight: sandals.nh, x: sandals.x, y: sandals.y, thumb: sandals.thumb })
    : null;
  const close = (a, b) => Math.abs(a - b) < 1.5;
  record(
    "thumb.sandals-centred-on-pin",
    Boolean(sandals && expected) &&
      close(sandals.left, expected.left) &&
      close(sandals.top, expected.top) &&
      close(sandals.width, expected.width) &&
      close(sandals.height, expected.height) &&
      sandals.y === 95 &&
      sandals.nw > 0,
    JSON.stringify({ sandals, expected }),
  );
  record(
    "desktop.row-shop-stays-primary",
    thumbs.some((row) => row.shopClass.includes("wide-btn-primary")),
    thumbs.map((row) => row.shopClass).join(" | "),
  );

  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
