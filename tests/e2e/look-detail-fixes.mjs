#!/usr/bin/env node
/**
 * Look detail fixes: seeded creator pages resolve, piece marks stay 28px,
 * Sun-Bleached Linen accounts for every pin, and pins are a 28px mark with no pulse.
 * Phone keeps LookPlate. Tablet (820 and 834) and desktop use WideLook: a 3:4 plate,
 * pins mapped through the crop within 2px, and Shop whole look opens the sheet.
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

async function measurePinPointer(page) {
  return page.evaluate(() => {
    const pointer = document.querySelector(".look-plate-pointer");
    const pin = document.querySelector('.tag-pin[aria-pressed="true"]');
    const card = document.querySelector(".look-plate-piece");
    if (!pointer || !pin || !card) return null;
    const box = pointer.getBoundingClientRect();
    const edge = pointer.getAttribute("data-edge");
    const pinBox = pin.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const tip =
      edge === "left"
        ? { x: box.left, y: box.top + box.height / 2 }
        : edge === "right"
          ? { x: box.right, y: box.top + box.height / 2 }
          : edge === "top"
            ? { x: box.left + box.width / 2, y: box.top }
            : { x: box.left + box.width / 2, y: box.bottom };
    const pinCentre = { x: pinBox.left + pinBox.width / 2, y: pinBox.top + pinBox.height / 2 };
    const nearestX = Math.max(cardBox.left, Math.min(pinCentre.x, cardBox.right));
    const nearestY = Math.max(cardBox.top, Math.min(pinCentre.y, cardBox.bottom));
    const gap = Math.hypot(pinCentre.x - nearestX, pinCentre.y - nearestY);
    const xAligned = pinCentre.x >= cardBox.left - 12 && pinCentre.x <= cardBox.right + 12;
    const yAligned = pinCentre.y >= cardBox.top - 12 && pinCentre.y <= cardBox.bottom + 12;
    return {
      label: pin.getAttribute("aria-label") ?? "",
      w: box.width,
      h: box.height,
      dist: Math.hypot(tip.x - pinCentre.x, tip.y - pinCentre.y),
      gap,
      beside: gap >= 16 && gap <= 96 && (xAligned || yAligned),
      edge,
      card: { x: Math.round(cardBox.left), y: Math.round(cardBox.top) },
      pin: { x: Math.round(pinCentre.x), y: Math.round(pinCentre.y) },
    };
  });
}

async function assertWidePlate(page, label) {
  const measured = await page.evaluate(() => {
    const plate = document.querySelector(".wide-plate");
    const frame = plate?.querySelector(".wide-plate-canvas");
    const image = frame?.querySelector("img");
    if (!plate || !frame || !image) return null;
    const box = frame.getBoundingClientRect();
    const naturalW = image.naturalWidth;
    const naturalH = image.naturalHeight;
    let crop = frame.dataset.crop ? JSON.parse(frame.dataset.crop) : null;
    if (!crop && naturalW > 0 && naturalH > 0) {
      if (naturalW / naturalH > 3 / 4) {
        const w = (naturalH * 3) / 4 / naturalW;
        crop = { x: (1 - w) / 2, y: 0, w, h: 1 };
      } else {
        const h = (naturalW * 4) / 3 / naturalH;
        crop = { x: 0, y: (1 - h) / 2, w: 1, h };
      }
    }
    const pins = [...frame.querySelectorAll("[data-tag-pin]")].map((pin) => {
      const rect = pin.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const u = Number(pin.dataset.imageX) / 100;
      const v = Number(pin.dataset.imageY) / 100;
      const expectedX = crop && crop.w > 0 ? (u - crop.x) / crop.w : u;
      const expectedY = crop && crop.h > 0 ? (v - crop.y) / crop.h : v;
      return {
        dx: cx - (box.left + expectedX * box.width),
        dy: cy - (box.top + expectedY * box.height),
      };
    });
    return {
      wide: Boolean(document.querySelector(".wide-look")),
      phonePlate: document.querySelectorAll(".look-plate").length,
      ratio: box.width / box.height,
      fit: getComputedStyle(image).objectFit,
      position: getComputedStyle(image).objectPosition,
      pins,
    };
  });
  record(
    `${label}.wide`,
    Boolean(measured?.wide) && measured.phonePlate === 0,
    JSON.stringify(measured && { wide: measured.wide, phonePlate: measured.phonePlate }),
  );
  record(
    `${label}.ratio`,
    Boolean(measured) && Math.abs(measured.ratio / 0.75 - 1) <= 0.01,
    String(measured?.ratio),
  );
  record(`${label}.not-stretched`, measured?.fit === "cover" || measured?.fit === "contain", measured?.fit ?? "");
  record(
    `${label}.object-position`,
    !measured?.position || measured.position === "50% 50%" || measured.position === "center",
    measured?.position ?? "",
  );
  record(`${label}.pins`, (measured?.pins.length ?? 0) > 0, String(measured?.pins.length ?? 0));
  for (const [index, pin] of (measured?.pins ?? []).entries()) {
    record(`${label}.pin${index}`, Math.abs(pin.dx) <= 2 && Math.abs(pin.dy) <= 2, JSON.stringify(pin));
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
  await page.locator(".wide-plate .tag-pin").first().waitFor({ timeout: 12_000 });
  await assertWidePlate(page, "tablet820");
  await page.getByRole("button", { name: "Shop whole look" }).click();
  await page.locator(".look-sheet").waitFor({ timeout: 6_000 });
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".look-sheet-row")];
    return {
      rows: rows.length,
      shops: document.querySelectorAll(".look-sheet-shop").length,
      thumbs: document.querySelectorAll(".look-sheet-thumb").length,
      url: location.pathname,
    };
  });
  record(
    "tablet.sheet-lists-pieces",
    sheet.rows === 4 && sheet.shops === 4 && sheet.thumbs === 4 && sheet.url.includes("/looks/seed-sunday-coat"),
    JSON.stringify(sheet),
  );

  await page.setViewportSize({ width: 834, height: 1194 });
  for (const look of SEED_LOOKS) {
    await openLook(page, look.id);
    await assertWidePlate(page, `tablet834.${look.id}`);
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
