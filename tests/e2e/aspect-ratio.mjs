#!/usr/bin/env node
/**
 * Every image surface keeps its native aspect ratio (never object-fit: fill) and pins
 * stay on their stored image coordinates, at phone, tablet and desktop widths.
 * Surfaces: look detail, feed card, house grid, create crop / pin / Details steps.
 * Not covered: the Save thumbnail (guest sheet has none). Creator grids resolve (#104).
 */
import { chromium } from "playwright";
import { CREATE_DRAFT_KEY } from "../../src/lib/looks/create-draft.ts";
import { resolveOrigin, clearUploadedDrafts, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 834, height: 1194 },
  { width: 1280, height: 800 },
];
const looks = [
  "seed-sofia-sun-bleached-linen",
  "seed-amara-charcoal-fleece-pleats",
  "seed-ines-emerald-cocktail",
  "seed-sunday-coat",
  "seed-brown-study",
  "seed-sofia-dune-path-midi",
];
const uploads = [
  { name: "2x3", w: 800, h: 1200 },
  { name: "9x16", w: 720, h: 1280 },
  { name: "3x4", w: 900, h: 1200 },
  { name: "16x10", w: 1280, h: 800 },
];
const PINS = [
  [50, 30],
  [45, 50],
  [55, 65],
];
const RATIO_TOLERANCE = 0.01;
const PIN_TOLERANCE_PX = 2;
const NOT_STRETCHED = ["cover", "contain", "none", "scale-down"];
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Runs in the page: measure every visible image inside `scope` that renders through LookCanvas or a crop frame. */
function measurePhotos(scope) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const nav = document.querySelector("nav.tab-bar");
  const navRect = nav?.getBoundingClientRect();
  const navTop = navRect && navRect.height > 0 ? navRect.top : null;
  const root = document.querySelector(scope) ?? document;
  return [...root.querySelectorAll("img")].filter(visible).map((img) => {
    const r = img.getBoundingClientRect();
    const host = img.closest(".look-photo-cover, .wide-plate-canvas, .create-plate-canvas, .echo-photo, .wide-lead-photo, .wide-leadcard, .wide-tile") ?? img.parentElement;
    const f = host.getBoundingClientRect();
    let crop = null;
    try {
      crop = JSON.parse(host.dataset.visibleCrop || "null");
    } catch {
      crop = null;
    }
    const pins = [...host.querySelectorAll("[data-tag-pin]")].map((pin) => {
      const b = pin.getBoundingClientRect();
      return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, ix: Number(pin.dataset.imageX), iy: Number(pin.dataset.imageY) };
    });
    return {
      loaded: img.complete && img.naturalWidth > 0,
      sized: Boolean(img.style.width) || host.matches(".look-photo-cover, .wide-plate-canvas, .create-plate-canvas"),
      baked: host.dataset.baked === "true",
      lookSurface: host.matches(".look-photo-cover, .wide-plate-canvas, .create-plate-canvas, .echo-photo, .wide-lead-photo, .wide-leadcard, .wide-tile"),
      rect: { left: r.left, top: r.top, w: r.width, h: r.height },
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      src: img.currentSrc,
      fit: getComputedStyle(img).objectFit,
      frame: { left: f.left, right: f.right, top: f.top, bottom: f.bottom },
      frameSize: { w: f.width, h: f.height },
      navTop,
      pins,
      pinMore: host.querySelector(".pin-more")?.textContent?.trim() ?? "",
      crop,
    };
  });
}

function checkThreeFour(label, m) {
  const ratio = m.frameSize.w / m.frameSize.h;
  record(`${label}.frame-3:4`, Math.abs(ratio / 0.75 - 1) <= RATIO_TOLERANCE, ratio.toFixed(4));
}

function checkNative(label, m) {
  const ratio = m.rect.w / m.rect.h;
  const natural = m.nw / m.nh;
  if (m.baked) {
    record(
      `${label}.native-ratio`,
      Number.isFinite(natural) && Math.abs(ratio / natural - 1) <= RATIO_TOLERANCE,
      `${ratio.toFixed(3)} vs ${natural.toFixed(3)} (${m.nw}x${m.nh} ${m.src})`,
    );
  }
  record(`${label}.not-fill`, m.fit !== "fill", m.fit);
  record(
    `${label}.covers-frame`,
    m.rect.left <= m.frame.left + 1 &&
      m.rect.left + m.rect.w >= m.frame.right - 1 &&
      m.rect.top <= m.frame.top + 1 &&
      m.rect.top + m.rect.h >= m.frame.bottom - 1,
    JSON.stringify({ img: m.rect, frame: m.frame }),
  );
}

function checkPins(label, m, expectedCount) {
  if (expectedCount !== undefined) {
    record(`${label}.pin-count`, m.pins.length >= expectedCount, `${m.pins.length} visible`);
  }
  m.pins.forEach((p, j) => {
    const x = p.ix / 100;
    const y = p.iy / 100;
    const expectedX = m.crop ? (x - m.crop.x) / m.crop.w : x;
    const expectedY = m.crop ? (y - m.crop.y) / m.crop.h : y;
    const dx = p.cx - (m.frame.left + expectedX * m.frameSize.w);
    const dy = p.cy - (m.frame.top + expectedY * m.frameSize.h);
    record(`${label}.pin-${j}-position`, Math.abs(dx) <= PIN_TOLERANCE_PX && Math.abs(dy) <= PIN_TOLERANCE_PX, `drift ${dx.toFixed(1)}x${dy.toFixed(1)}px`);
    const inside = p.cx >= m.frame.left && p.cx <= m.frame.right && p.cy >= m.frame.top && p.cy <= m.frame.bottom;
    record(`${label}.pin-${j}-in-frame`, inside);
    if (m.navTop !== null) record(`${label}.pin-${j}-above-tab-bar`, p.cy <= m.navTop, `y=${p.cy.toFixed(0)} nav=${m.navTop.toFixed(0)}`);
  });
}

async function waitForCropped(page, scope) {
  await page.waitForFunction(
    (sel) => {
      const root = document.querySelector(sel) ?? document;
      const photos = [...root.querySelectorAll(".look-photo-cover img, .wide-plate-canvas img, .create-plate-canvas img")];
      return photos.length > 0 && photos.every((img) => {
        const rect = img.getBoundingClientRect();
        return (
          rect.width > 0 &&
          img.complete &&
          img.naturalWidth > 0 &&
          getComputedStyle(img).visibility !== "hidden"
        );
      });
    },
    scope,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(300);
}

async function waitForNetworkReady(page) {
  await page.waitForFunction(() => document.querySelectorAll("img").length > 0, null, { timeout: 15_000 });
  // Below-the-fold feed photos are loading="lazy" and stay incomplete until scrolled near.
  // Only images actually in the viewport have to finish; those are the ones this check measures.
  await page.waitForFunction(
    () => {
      const viewW = window.innerWidth || document.documentElement.clientWidth;
      const viewH = window.innerHeight || document.documentElement.clientHeight;
      const visible = [...document.querySelectorAll("img")].filter((img) => {
        const box = img.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < viewH && box.left < viewW;
      });
      return visible.length > 0 && visible.every((img) => img.complete && img.naturalWidth > 0);
    },
    null,
    { timeout: 15_000 },
  );
}

async function lookDetail(browser, viewport) {
  for (const slug of looks) {
    await withPage(
      browser,
      origin,
      async (page) => {
        await page.goto(`${origin}/looks/${slug}`, { waitUntil: "domcontentloaded" });
        await waitForCropped(page, "body");
        const photos = (await page.evaluate(measurePhotos, "body")).filter((m) => m.sized);
        const label = `look-detail.${slug}@${viewport.width}`;
        record(`${label}.photo-found`, photos.length > 0);
        photos.forEach((m, i) => {
          if (m.lookSurface) {
            if ([375, 390].includes(viewport.width)) record(`${label}.${i}.baked`, m.baked);
            checkThreeFour(`${label}.${i}`, m);
            checkNative(`${label}.${i}`, m);
            checkPins(`${label}.${i}`, m);
            if ([375, 390].includes(viewport.width) && ["seed-brown-study", "seed-sofia-dune-path-midi"].includes(slug)) {
              record(`${label}.${i}.hidden-pin-chip`, m.pinMore === "+1 piece", m.pinMore || "missing");
            }
          }
        });
      },
      `aspect-look-${viewport.width}`,
      { viewport },
    );
  }
}

/** Feed card and house grids are cover tiles: never stretched, whatever the photo ratio. */
async function coverSurfaces(browser, viewport) {
  await withPage(
    browser,
    origin,
    async (page) => {
      const pages = ["/", "/houses"];
      const visit = async (path, name) => {
        await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
        await waitForNetworkReady(page);
        await page.waitForTimeout(300);
        const photos = (await page.evaluate(measurePhotos, "body")).filter((m) => m.loaded && m.nw > 64);
        record(`${name}@${viewport.width}.photos-found`, photos.length > 0, String(photos.length));
        photos.forEach((m, i) => {
          if (m.lookSurface) checkThreeFour(`${name}@${viewport.width}.${i}`, m);
          record(`${name}@${viewport.width}.${i}.not-stretched`, NOT_STRETCHED.includes(m.fit), m.fit);
          if (m.fit === "cover") {
            const natural = m.nw / m.nh;
            const box = m.rect.w / m.rect.h;
            record(`${name}@${viewport.width}.${i}.box-sane`, box > 0.2 && box < 5 && Number.isFinite(natural));
          }
        });
      };
      await visit(pages[0], "feed-card");
      await visit(pages[1], "house-grid");
      const href = await page.evaluate(() => [...document.querySelectorAll("a[href^='/houses/']")].map((a) => a.getAttribute("href"))[0]);
      if (href) await visit(href, "house-page");
    },
    `aspect-cover-${viewport.width}`,
    { viewport },
  );
}

async function makeImage(page, { w, h }) {
  return page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#c9a27a");
      g.addColorStop(1, "#2f4858");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.6);
    },
    { w, h },
  );
}

/** Create flow with an uploaded-style photo: crop step, pin step and Details preview. */
async function createFlow(browser, viewport, upload) {
  await withPage(
    browser,
    origin,
    async (page) => {
      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
      const imageSrc = await makeImage(page, upload);
      const draft = {
        id: `aspect-${upload.name}`,
        userId: "",
        title: "Aspect cut",
        caption: "",
        creator: "You",
        imageSrc,
        createdAt: 1,
        updatedAt: 1,
        tags: PINS.map(([x, y], i) => ({ id: `pin-${i}`, x, y, name: `Piece ${i + 1}`, brand: "Zara", price: "", currency: "EUR", url: "", retailerId: "zara", offers: [] })),
      };
      await page.evaluate(([key, raw]) => sessionStorage.setItem(key, raw), [CREATE_DRAFT_KEY, JSON.stringify(draft)]);
      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
      await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 10_000 });
      const label = `create.${upload.name}@${viewport.width}`;

      if ((await page.locator(".look-studio").getAttribute("data-step")) === "crop") {
        await page.locator(".crop-frame").waitFor({ timeout: 10_000 });
        await page.waitForTimeout(300);
        const crop = (await page.evaluate(measurePhotos, ".crop-frame"))[0];
        if (crop) {
          const ratio = crop.rect.w / crop.rect.h;
          const natural = crop.nw / crop.nh;
          record(`${label}.crop-step.proportional`, Math.abs(ratio / natural - 1) <= RATIO_TOLERANCE, `${ratio.toFixed(3)} vs ${natural.toFixed(3)}`);
          record(`${label}.crop-step.not-fill`, crop.fit !== "fill", crop.fit);
        }
        await page.getByRole("button", { name: "Use photo" }).click();
        await page.waitForFunction(() => document.querySelector(".look-studio")?.getAttribute("data-step") === "pins", null, { timeout: 8_000 });
      }

      await waitForCropped(page, ".create-plate-canvas");
      const pinStep = (await page.evaluate(measurePhotos, ".create-plate-canvas")).filter((m) => m.sized);
      record(`${label}.pin-step.photo-found`, pinStep.length > 0);
      pinStep.forEach((m, i) => {
        checkNative(`${label}.pin-step.${i}`, m);
        checkPins(`${label}.pin-step.${i}`, m);
      });

      await page.getByRole("button", { name: "Done" }).first().click();
      await page.getByRole("heading", { name: "Details" }).waitFor({ timeout: 8_000 });
      await waitForCropped(page, ".create-details-photo");
      const details = (await page.evaluate(measurePhotos, ".create-details-photo")).filter((m) => m.sized);
      record(`${label}.details.photo-found`, details.length > 0);
      details.forEach((m, i) => {
        checkNative(`${label}.details.${i}`, m);
        checkPins(`${label}.details.${i}`, m);
      });
      await clearUploadedDrafts(page);
    },
    `aspect-create-${upload.name}-${viewport.width}`,
    { viewport },
  );
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
try {
  for (const viewport of viewports) {
    await lookDetail(browser, viewport);
    await coverSurfaces(browser, viewport);
    for (const upload of uploads) await createFlow(browser, viewport, upload);
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
