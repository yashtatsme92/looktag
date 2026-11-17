#!/usr/bin/env node
/**
 * Phone look detail (2.5.51).
 *
 * At 390×844 the look photo is a square-cornered 3:4 frame flush with the top
 * of the viewport (under the status bar, not inset below it). Follow in the
 * white meta band is plain ink text beside the creator name, not a filled
 * chip. Safari emulation and iOS standalone with safe-area insets both run. Importing this module does not launch a browser.
 */
import { pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";
import { BOOT_SKIP_KEY, BROWSE_COACH_KEY, STYLE_GUIDE_KEY, resolveOrigin } from "./helpers.mjs";
import { applySafeAreaInsets, emulateStandalone, FEED_SAFE_AREA } from "./feed-snap.mjs";

const origin = resolveOrigin();
const LOOK = "/looks/seed-sunday-coat";
const iphone = {
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
};

const RATIO = 3 / 4;
const RATIO_TOL = 0.01;

function parseColor(value) {
  const parts = String(value || "")
    .match(/[\d.]+/g)
    ?.map(Number);
  if (!parts || parts.length < 3) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

export async function readLookDetail(page) {
  return page.evaluate(() => {
    const plate = document.querySelector(".look-plate");
    const photo = document.querySelector(".look-plate .look-plate-canvas");
    const follow = document.querySelector(".look-plate-meta button.follow-text");
    const back = document.querySelector(".look-plate-bar button[aria-label='Back']");
    const chip = document.querySelector(".look-plate .pin-more");
    const main = document.querySelector("#native-main");
    const theme = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "";
    const barStyle = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content") || "";
    if (!plate || !photo) return { missing: true };
    const photoRect = photo.getBoundingClientRect();
    const photoStyle = getComputedStyle(photo);
    const followStyle = follow ? getComputedStyle(follow) : null;
    const backRect = back ? back.getBoundingClientRect() : null;
    const backStyle = back ? getComputedStyle(back) : null;
    const chipRect = chip ? chip.getBoundingClientRect() : null;
    return {
      missing: false,
      radius: photoStyle.borderRadius,
      top: photoRect.top,
      width: photoRect.width,
      height: photoRect.height,
      plateBg: getComputedStyle(plate).backgroundColor,
      mainBg: main ? getComputedStyle(main).backgroundColor : "",
      theme,
      barStyle,
      follow: follow
        ? {
            text: follow.textContent.trim(),
            disabled: follow.disabled,
            bg: followStyle.backgroundColor,
            color: followStyle.color,
            opacity: followStyle.opacity,
            border: followStyle.borderTopWidth,
          }
        : null,
      back: backRect && backStyle
        ? {
            top: backRect.top,
            left: backRect.left,
            width: backRect.width,
            height: backRect.height,
            radius: backStyle.borderRadius,
            bg: backStyle.backgroundColor,
            color: backStyle.color,
          }
        : null,
      chip: chipRect ? { top: chipRect.top, left: chipRect.left, text: chip.textContent.trim() } : null,
    };
  });
}

export async function assertPhoneLookDetail(page, label, { safeTop = 0 } = {}) {
  const failures = [];
  const check = (name, ok, detail = "") => {
    if (!ok) failures.push(name);
    console.log(`${ok ? "ok" : "FAIL"}  ${label}.${name}${detail ? ` — ${detail}` : ""}`);
  };

  await page.goto(`${origin}${LOOK}`, { waitUntil: "domcontentloaded" });
  await page.locator(".look-plate-canvas").waitFor({ timeout: 15_000 });
  await page.locator(".look-plate-meta").getByRole("button", { name: /^Follow$|^Following ✓$/ }).waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector(".look-plate-canvas img");
    return Boolean(img && img.complete && img.naturalWidth > 0);
  });

  const m = await readLookDetail(page);
  check("present", Boolean(m && !m.missing));
  if (!m || m.missing) return failures;

  const radii = String(m.radius)
    .split(" ")
    .filter(Boolean);
  check("radius-0", radii.length > 0 && radii.every((part) => parseFloat(part) === 0), m.radius);

  check("top-flush", m.top <= 1, `top ${m.top.toFixed(1)}`);
  const ratio = m.height > 0 ? m.width / m.height : 0;
  check(
    "frame-3:4",
    Math.abs(ratio - RATIO) <= RATIO_TOL && Math.abs(m.width - 390) <= 2,
    `${m.width.toFixed(1)}×${m.height.toFixed(1)} ratio ${ratio.toFixed(4)}`,
  );

  const plate = parseColor(m.plateBg);
  const main = parseColor(m.mainBg);
  const white = (c) => c && c.a > 0.9 && c.r > 250 && c.g > 250 && c.b > 250;
  const ground = (c) =>
    c && c.a > 0.9 && ((c.r > 240 && c.g > 240 && c.b > 240) || (Math.abs(c.r - 244) < 4 && Math.abs(c.g - 244) < 4 && Math.abs(c.b - 244) < 4));
  const black = (c) => c && c.a > 0.9 && c.r < 30 && c.g < 30 && c.b < 30;
  check("plate-white", white(plate), m.plateBg);
  check("ground-not-black", ground(main) && !black(main), m.mainBg);
  check("theme-color-light", /^#(?:f4f4f4|ffffff)$/i.test(m.theme), m.theme || "missing");
  check("status-bar-not-black", m.barStyle !== "black", m.barStyle || "missing");

  const followBg = parseColor(m.follow?.bg);
  const followFg = parseColor(m.follow?.color);
  const plain =
    followBg && followBg.a < 0.05 && followFg && followFg.r < 40 && followFg.a > 0.9 && parseFloat(m.follow.border) === 0;
  check(
    "follow-text",
    Boolean(m.follow) && m.follow.text === "Follow" && !m.follow.disabled && Number(m.follow.opacity) > 0.9 && plain,
    m.follow ? `${m.follow.text} bg ${m.follow.bg} fg ${m.follow.color} border ${m.follow.border}` : "missing",
  );

  const creatorHref = await page.locator("a.look-plate-kicker").getAttribute("href");
  const creatorId = creatorHref?.split("/").filter(Boolean).pop() || "";
  if (creatorId && m.follow?.text === "Follow") {
    await page.evaluate((id) => {
      localStorage.setItem("looktag-followed-creators-v1", JSON.stringify([id]));
    }, creatorId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".look-plate-meta").getByRole("button", { name: "Following ✓" }).waitFor({ timeout: 15_000 });
    const followed = await readLookDetail(page);
    const bg = parseColor(followed?.follow?.bg);
    const fg = parseColor(followed?.follow?.color);
    const stillPlain = bg && bg.a < 0.05 && fg && fg.r < 40 && fg.a > 0.9 && parseFloat(followed?.follow?.border) === 0;
    check(
      "follow-text-when-following",
      Boolean(followed?.follow) && followed.follow.text === "Following ✓" && !followed.follow.disabled && stillPlain,
      followed?.follow ? `${followed.follow.text} bg ${followed.follow.bg} fg ${followed.follow.color}` : "missing",
    );
  }

  const expectedTop = safeTop + 12;
  check(
    "controls-inset",
    Boolean(m.back) &&
      Math.abs(m.back.top - expectedTop) <= 2 &&
      Math.abs(m.back.left - 16) <= 2 &&
      Math.abs(m.back.width - 44) <= 1 &&
      Math.abs(m.back.height - 44) <= 1 &&
      parseFloat(m.back.radius) === 12,
    m.back ? `top ${m.back.top.toFixed(1)} left ${m.back.left.toFixed(1)} ${m.back.width.toFixed(0)} r ${m.back.radius}` : "missing",
  );
  if (m.chip) {
    check(
      "chip-below-back",
      m.chip.left >= 14 && m.chip.left <= 18 && m.back && m.chip.top >= m.back.top + m.back.height - 1,
      `chip ${m.chip.text} top ${m.chip.top.toFixed(1)} left ${m.chip.left.toFixed(1)}`,
    );
  }
  return failures;
}

async function bootContext(browser, { standalone = false, safeArea = false } = {}) {
  const context = await browser.newContext({ ...iphone, locale: "en-GB" });
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
        const failures = await assertPhoneLookDetail(page, `look-detail.${c.name}`, { safeTop: c.safeTop });
        if (failures.length) failed = true;
      } catch (error) {
        failed = true;
        console.log(`FAIL  look-detail.${c.name} — ${error instanceof Error ? error.message : error}`);
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
