#!/usr/bin/env node
/**
 * Phone For You snap (2.5.50).
 *
 * At 390×844 the snap plate stays full-bleed: .echo-plate is exactly one
 * .echo-snap viewport, .echo-photo covers that plate with no gap band above
 * or below, and after a wheel snap the previous look's title and piece count
 * are not painted in the header band under the Looktag wordmark.
 *
 * Runs in mobile Safari emulation and in iOS standalone with safe-area insets.
 * Importing this module does not launch a browser; `assertForYouSnap` is shared
 * with tests/e2e/ios-standalone.mjs.
 */
import { pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";
import { BOOT_SKIP_KEY, BROWSE_COACH_KEY, STYLE_GUIDE_KEY, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const iphone = {
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
};

/** iPhone 13-class insets. Chromium only honours these via CDP + viewport-fit=cover. */
export const FEED_SAFE_AREA = { top: 47, left: 0, right: 0, bottom: 34 };

const GAP_PX = 1;
const HEIGHT_PX = 1;

export async function applySafeAreaInsets(page, insets = FEED_SAFE_AREA) {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setSafeAreaInsetsOverride", { insets });
}

/** display-mode: standalone plus a shorter visual viewport, matching ios-standalone.mjs. */
export async function emulateStandalone(page, shortfall) {
  await page.addInitScript((gap) => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (!/display-mode:\s*standalone/.test(query)) return real(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      };
    };
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () =>
        Object.assign(new EventTarget(), {
          height: window.innerHeight - gap,
          width: window.innerWidth,
          offsetTop: 0,
          offsetLeft: 0,
          scale: 1,
        }),
    });
  }, shortfall);
}

/** Geometry of the first look plate and whether its title / piece line sit in the header band. */
export async function readFeedSnap(page) {
  return page.evaluate(() => {
    const snap = document.querySelector(".echo-snap");
    const plates = [...document.querySelectorAll(".echo-snap > .echo-plate")];
    const plate = plates.find((el) => el.querySelector(".echo-title") && el.querySelector(".echo-pieces"));
    const photo = plate?.querySelector(".echo-photo");
    const word = document.querySelector(".echo-bar .echo-wordmark");
    const bar = document.querySelector(".echo-bar");
    if (!snap || !plate || !photo || !word || !bar) {
      return { missing: true, hasSnap: Boolean(snap), hasPlate: Boolean(plate), hasPhoto: Boolean(photo) };
    }
    const plateRect = plate.getBoundingClientRect();
    const photoRect = photo.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const title = plate.querySelector(".echo-title");
    const pieces = plate.querySelector(".echo-pieces");
    const titleRect = title.getBoundingClientRect();
    const piecesRect = pieces.getBoundingClientRect();
    const bandTop = wordRect.bottom;
    const bandBottom = Math.max(barRect.bottom, wordRect.bottom + 1);
    const hit = (rect) => {
      const overBand = rect.bottom > bandTop + 0.5 && rect.top < bandBottom - 0.5 && rect.right > 0 && rect.left < window.innerWidth;
      const overView = rect.bottom > 0.5 && rect.top < window.innerHeight - 0.5;
      return overBand && overView;
    };
    return {
      missing: false,
      title: title.textContent.trim(),
      pieces: pieces.textContent.trim(),
      plateH: plateRect.height,
      snapH: snap.clientHeight,
      gapTop: photoRect.top - plateRect.top,
      gapBottom: plateRect.bottom - photoRect.bottom,
      gapLeft: photoRect.left - plateRect.left,
      gapRight: plateRect.right - photoRect.right,
      scrollTop: snap.scrollTop,
      barH: barRect.height,
      bandTop,
      bandBottom,
      titleInHeader: hit(titleRect),
      piecesInHeader: hit(piecesRect),
      titleTop: titleRect.top,
      piecesTop: piecesRect.top,
    };
  });
}

/**
 * Open For You and assert the phone snap plate.
 * Safe-area / standalone emulation must already be installed on `page`.
 */
export async function assertForYouSnap(page, label, { safeTop = 0 } = {}) {
  const failures = [];
  const check = (name, ok, detail = "") => {
    if (!ok) failures.push(name);
    console.log(`${ok ? "ok" : "FAIL"}  ${label}.${name}${detail ? ` — ${detail}` : ""}`);
  };

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".echo-snap").waitFor({ timeout: 15_000 });
  await page.locator(".echo-plate .echo-title").first().waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector(".echo-plate .echo-photo img");
    return Boolean(img && img.complete && img.naturalWidth > 0);
  });
  // The feed restores scroll for 2.5s and will cancel a snap if the plate list
  // is still changing. Wait until the deck stops growing before measuring.
  await page.waitForFunction(() => {
    const count = document.querySelectorAll(".echo-snap > .echo-plate").length;
    const state = window.__feedSnapStable ?? { count: -1, hits: 0 };
    state.hits = state.count === count && count > 1 ? state.hits + 1 : 0;
    state.count = count;
    window.__feedSnapStable = state;
    return state.hits >= 3;
  }, null, { timeout: 15_000, polling: 200 });

  const before = await readFeedSnap(page);
  check("plate-present", Boolean(before && !before.missing), before?.missing ? JSON.stringify(before) : before?.title || "");
  if (!before || before.missing) return failures;

  check(
    "plate-height",
    Math.abs(before.plateH - before.snapH) <= HEIGHT_PX,
    `plate ${before.plateH.toFixed(1)} snap ${before.snapH.toFixed(1)}`,
  );
  check(
    "photo-covers-plate",
    Math.abs(before.gapTop) <= GAP_PX &&
      Math.abs(before.gapBottom) <= GAP_PX &&
      Math.abs(before.gapLeft) <= GAP_PX &&
      Math.abs(before.gapRight) <= GAP_PX,
    `gaps t${before.gapTop.toFixed(1)} b${before.gapBottom.toFixed(1)} l${before.gapLeft.toFixed(1)} r${before.gapRight.toFixed(1)}`,
  );
  if (safeTop > 0) {
    check("safe-area-inset", before.barH >= 72 + safeTop - 1, `bar ${before.barH.toFixed(1)} expected >= ${72 + safeTop}`);
  }

  const box = await page.locator(".echo-snap").boundingBox();
  check("snap-box", Boolean(box), box ? "" : "no bounding box");
  // Wheel marks the feed's scroll guard as touched and asks for the next plate.
  // Smooth scroll can be cancelled if the deck re-renders, so pin scrollTop to
  // one viewport after the wheel and retry until it stays there.
  let landed = false;
  for (let attempt = 0; attempt < 6 && !landed; attempt += 1) {
    await page.evaluate(() => {
      const el = document.querySelector(".echo-snap");
      if (!el) return;
      if (el.scrollTop < el.clientHeight - 8) {
        el.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true }));
        el.scrollTop = el.clientHeight;
      }
    });
    await page.waitForTimeout(250);
    landed = await page.evaluate(() => {
      const el = document.querySelector(".echo-snap");
      return Boolean(el && el.clientHeight > 0 && el.scrollTop >= el.clientHeight - 8);
    });
  }
  const mid = await readFeedSnap(page);
  const scrollDetail = mid && !mid.missing
    ? `scroll ${mid.scrollTop.toFixed(0)} / ${mid.snapH.toFixed(0)}`
    : "snap missing";
  check("snapped-next", landed, scrollDetail);

  const after = mid && !mid.missing ? mid : await readFeedSnap(page);
  const headerDetail = (m) =>
    m && !m.missing
      ? `${m.title} @ ${m.titleTop.toFixed(0)} band ${m.bandTop.toFixed(0)}-${m.bandBottom.toFixed(0)}`
      : "missing";
  check("previous-title-not-in-header", Boolean(after && !after.missing && !after.titleInHeader), headerDetail(after));
  check(
    "previous-pieces-not-in-header",
    Boolean(after && !after.missing && !after.piecesInHeader && /\d+\s+pieces?/.test(after.pieces || "")),
    after && !after.missing ? `${after.pieces} @ ${after.piecesTop.toFixed(0)}` : "missing",
  );
  return failures;
}

async function bootContext(browser, { standalone = false, safeArea = false } = {}) {
  const context = await browser.newContext({
    ...iphone,
    locale: "en-GB",
  });
  await context.addInitScript(
    ([guide, coach, boot]) => {
      try {
        localStorage.setItem(guide, "done");
        localStorage.setItem(coach, "done");
        sessionStorage.setItem(boot, "done");
      } catch {
        /* private mode */
      }
    },
    [STYLE_GUIDE_KEY, BROWSE_COACH_KEY, BOOT_SKIP_KEY],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  if (standalone) await emulateStandalone(page, 34);
  if (safeArea) await applySafeAreaInsets(page, FEED_SAFE_AREA);
  return { context, page };
}

async function main() {
  let failed = false;
  const browser = await chromium.launch();
  try {
    const cases = [
      { name: "safari", standalone: false, safeArea: false, safeTop: 0 },
      { name: "standalone", standalone: true, safeArea: true, safeTop: FEED_SAFE_AREA.top },
    ];
    for (const c of cases) {
      const { context, page } = await bootContext(browser, c);
      try {
        const failures = await assertForYouSnap(page, `feed-snap.${c.name}`, { safeTop: c.safeTop });
        if (failures.length) failed = true;
      } catch (error) {
        failed = true;
        console.log(`FAIL  feed-snap.${c.name} — ${error instanceof Error ? error.message : error}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) await main();
