#!/usr/bin/env node
/**
 * Sitewide Follow rule (2.5.52).
 *
 * Beside a name, Follow is plain 14px text (no fill, no border), right-aligned,
 * with a 44px hit area. "Following ✓" once followed. Creator and House profiles
 * are the filled #111 primary, then a 44px ink ghost. Feed text is white on the
 * photo at 390 and 834, and ink in the desktop copy column at 1280.
 *
 * Importing this module does not launch a browser.
 */
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BOOT_SKIP_KEY, BROWSE_COACH_KEY, STYLE_GUIDE_KEY, fillAdminLogin, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const LOOK = "/looks/seed-sunday-coat";
const HOUSE = "/houses/label-atelier-noir";
const CHECK = "Following ✓";

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "834", width: 834, height: 1194 },
  { name: "1280", width: 1280, height: 800 },
];

function parseColor(value) {
  const parts = String(value || "")
    .match(/[\d.]+/g)
    ?.map(Number);
  if (!parts || parts.length < 3) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function isInk(color) {
  return Boolean(color && color.a > 0.9 && color.r < 40 && color.g < 40 && color.b < 40);
}

function isWhite(color) {
  return Boolean(color && color.a > 0.9 && color.r > 240 && color.g > 240 && color.b > 240);
}

function isClear(color) {
  return Boolean(color && color.a < 0.05);
}

const READ_FOLLOW = `(() => {
  const visible = (el) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      node = node.parentElement;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  };
  const labelOf = (el) => (el.textContent || "").replace(/\\s+/g, " ").trim();
  const follow = [...document.querySelectorAll("button")].find((el) => {
    if (el.closest(".echo-tabs, .wide-tabs, .account-sheet-modal")) return false;
    const label = labelOf(el);
    if (!/^Follow$|^Following(?: ✓)?$/.test(label)) return false;
    return visible(el);
  });
  if (!follow) return null;
  const style = getComputedStyle(follow);
  const rect = follow.getBoundingClientRect();
  const row = follow.closest(".echo-kicker-row");
  const rowRect = row ? row.getBoundingClientRect() : null;
  const name = row ? row.querySelector("a, p, button.echo-kicker, button.wide-kicker-link") : null;
  const nameRect = name && name !== follow ? name.getBoundingClientRect() : null;
  const borderWidth = parseFloat(style.borderTopWidth) || 0;
  return {
    text: labelOf(follow),
    bg: style.backgroundColor,
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily,
    borderWidth,
    borderStyle: style.borderTopStyle,
    borderColor: style.borderTopColor,
    radius: style.borderRadius,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    top: rect.top,
    left: rect.left,
    rowRight: rowRect ? rowRect.right : null,
    rowTop: rowRect ? rowRect.top : null,
    rowHeight: rowRect ? rowRect.height : null,
    nameLeft: nameRect ? nameRect.left : null,
  };
})()`;

function readFollow(page) {
  return page.evaluate((source) => {
    const run = new Function(`return (${source});`);
    return run();
  }, READ_FOLLOW);
}

function plainText(follow, { ink }) {
  if (!follow) return false;
  const bg = parseColor(follow.bg);
  const fg = parseColor(follow.color);
  const family = String(follow.fontFamily || "");
  const right = follow.rowRight != null && Math.abs(follow.right - follow.rowRight) <= 8;
  const sameRow = follow.rowTop != null && follow.top >= follow.rowTop - 2 && follow.top <= follow.rowTop + follow.rowHeight + 2;
  const opposite = follow.nameLeft == null || follow.left > follow.nameLeft + 8;
  return (
    isClear(bg) &&
    follow.borderWidth === 0 &&
    (ink ? isInk(fg) : isWhite(fg)) &&
    follow.fontSize === "14px" &&
    Number(follow.fontWeight) >= 600 &&
    /Figtree/i.test(family) &&
    follow.width >= 44 &&
    follow.height >= 44 &&
    right &&
    sameRow &&
    opposite
  );
}

function filledProfile(follow) {
  if (!follow || follow.text !== "Follow") return false;
  const bg = parseColor(follow.bg);
  const fg = parseColor(follow.color);
  const radius = String(follow.radius)
    .split(" ")
    .filter(Boolean)
    .map((part) => parseFloat(part));
  return (
    isInk(bg) &&
    isWhite(fg) &&
    Math.abs(follow.height - 44) <= 1 &&
    radius.length > 0 &&
    radius.every((value) => value === 12)
  );
}

function ghostProfile(follow) {
  if (!follow || follow.text !== CHECK) return false;
  const bg = parseColor(follow.bg);
  const fg = parseColor(follow.color);
  const border = parseColor(follow.borderColor);
  const radius = String(follow.radius)
    .split(" ")
    .filter(Boolean)
    .map((part) => parseFloat(part));
  return (
    isClear(bg) &&
    isInk(fg) &&
    isInk(border) &&
    follow.borderWidth === 1 &&
    Math.abs(follow.height - 44) <= 1 &&
    radius.length > 0 &&
    radius.every((value) => value === 12)
  );
}

async function boot(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "en-GB",
  });
  await context.addInitScript(
    ([guide, coach, bootKey]) => {
      try {
        localStorage.setItem(guide, "done");
        localStorage.setItem(coach, "done");
        sessionStorage.setItem(bootKey, "done");
      } catch {
        /* private mode */
      }
    },
    [STYLE_GUIDE_KEY, BROWSE_COACH_KEY, BOOT_SKIP_KEY],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return { context, page };
}

async function gotoReady(page, path) {
  const target = new URL(path, origin).pathname;
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForURL((url) => url.pathname === target, { timeout: 15_000 });
      await page.waitForFunction(
        () => document.documentElement.dataset.feedReady === "true" || document.querySelector(".look-plate, .wide-look, .house-profile, .ds-screen-title, h1"),
        null,
        { timeout: 20_000 },
      );
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

export async function assertGuestSurface(page, label, kind) {
  const failures = [];
  const check = (name, ok, detail = "") => {
    if (!ok) failures.push(`${label}.${name}`);
    console.log(`${ok ? "ok" : "FAIL"}  ${label}.${name}${detail ? ` — ${detail}` : ""}`);
  };

  const follow = await readFollow(page);
  const detail = follow
    ? `${follow.text} ${follow.width.toFixed(0)}×${follow.height.toFixed(0)} bg ${follow.bg} fg ${follow.color} border ${follow.borderWidth} ${follow.fontSize}/${follow.fontWeight}`
    : "missing";

  if (kind === "look" || kind === "feed") {
    const ink = kind === "look" || label.endsWith(".1280");
    check("follow-plain-text", plainText(follow, { ink }), detail);
    if (kind === "feed") {
      const fg = parseColor(follow?.color);
      const wantWhite = !label.endsWith(".1280");
      check("feed-follow-color", wantWhite ? isWhite(fg) : isInk(fg), follow?.color || "missing");
      const primary = await page.evaluate(() => {
        const visible = (el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
        };
        const lead = [...document.querySelectorAll(".echo-plate, .wide-leadcard, .wide-leadrow")].find((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 20 && rect.height > 20;
        });
        if (!lead) return { found: false, count: 0 };
        const nodes = [...lead.querySelectorAll(".echo-act-echo, .wide-btn-primary, .wide-btn-onphoto")].filter(visible);
        return { found: true, count: nodes.length, text: nodes.map((node) => node.textContent.replace(/\s+/g, " ").trim()).join("|") };
      });
      check("one-filled-primary", primary.found && primary.count === 1, JSON.stringify(primary));
    }
    if (kind === "look" && label.endsWith(".390")) {
      const shop = await page.evaluate(() => {
        const meta = document.querySelector(".look-plate-meta");
        const button = meta?.querySelector(".look-plate-shop");
        const row = meta?.querySelector(".echo-kicker-row");
        if (!meta || !button || !row) return null;
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const filled = [...meta.querySelectorAll("button, a")].filter((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          const parts = bg.match(/[\d.]+/g)?.map(Number) || [];
          const alpha = parts.length > 3 ? parts[3] : 1;
          return alpha > 0.85 && parts[0] < 40 && parts[1] < 40 && parts[2] < 40 && el.getBoundingClientRect().width > 2;
        });
        return {
          bg: style.backgroundColor,
          color: style.color,
          height: rect.height,
          radius: style.borderRadius,
          width: rect.width,
          rowWidth: rowRect.width,
          filled: filled.length,
          filledText: filled.map((el) => el.textContent.replace(/\s+/g, " ").trim()).join("|"),
        };
      });
      const bg = parseColor(shop?.bg);
      const fg = parseColor(shop?.color);
      const radius = String(shop?.radius || "")
        .split(" ")
        .filter(Boolean)
        .map((part) => parseFloat(part));
      check(
        "shop-only-filled-primary",
        Boolean(shop) &&
          isInk(bg) &&
          isWhite(fg) &&
          Math.abs(shop.height - 44) <= 1 &&
          radius.every((value) => value === 12) &&
          Math.abs(shop.width - shop.rowWidth) <= 4 &&
          shop.filled === 1,
        shop ? JSON.stringify(shop) : "missing",
      );
    }
    if (kind === "look" && !label.endsWith(".390")) {
      const shops = await page.evaluate(() => {
        const visible = (el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && rect.width > 2 && rect.height > 2;
        };
        const header = [...document.querySelectorAll(".wide-panel-hd button")].filter(visible);
        const filledHeader = header.filter((el) => {
          const parts = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
          const alpha = parts.length > 3 ? parts[3] : 1;
          return alpha > 0.85 && parts[0] < 40;
        });
        const rows = [...document.querySelectorAll(".wide-prow")].filter(visible);
        const primaries = rows.map((row) => row.querySelectorAll(".wide-btn-primary").length);
        return { filledHeader: filledHeader.length, rows: rows.length, primaries };
      });
      check(
        "piece-shops-stay-primary",
        shops.filledHeader === 0 && shops.rows > 0 && shops.primaries.every((count) => count === 1),
        JSON.stringify(shops),
      );
    }
  } else {
    check("profile-filled", filledProfile(follow), detail);
    const filled = await page.evaluate(() => {
      const root = document.querySelector(".house-profile-info") || document.querySelector("#native-main") || document.body;
      return [...root.querySelectorAll("button, a")].filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === "none" || rect.width < 2 || rect.height < 2) return false;
        const parts = style.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
        const alpha = parts.length > 3 ? parts[3] : 1;
        const fg = style.color.match(/[\d.]+/g)?.map(Number) || [];
        return alpha > 0.85 && parts[0] < 40 && parts[1] < 40 && parts[2] < 40 && (fg[0] ?? 0) > 200;
      }).length;
    });
    check("one-filled-primary", filled === 1, String(filled));
  }

  const url = page.url();
  await page.waitForFunction(async () => {
    try {
      const res = await fetch("/api/auth/get-session", { credentials: "include" });
      return res.ok;
    } catch {
      return false;
    }
  }, null, { timeout: 12_000 }).catch(() => {});
  const followButton =
    kind === "house"
      ? page.locator(".house-profile .house-follow").filter({ visible: true }).first()
      : page.locator("button").filter({ hasText: /^Follow$/ }).filter({ visible: true }).first();
  const sheet = page.getByRole("dialog").filter({ hasText: "Sign in to follow" });
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    if (await sheet.isVisible().catch(() => false)) {
      opened = true;
      break;
    }
    await followButton.click().catch(() => {});
    opened = await sheet.waitFor({ timeout: 2_500 }).then(() => true).catch(() => false);
  }
  if (!opened) {
    const snippet = await page.locator("body").innerText().then((text) => text.replace(/\s+/g, " ").slice(0, 240)).catch(() => "");
    check("guest-sheet", false, snippet);
  } else {
    check("guest-sheet", true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await sheet.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
  }
  check("guest-stays", page.url() === url, page.url());
  return failures;
}

export async function assertSignedToggle(page, label, kind) {
  const failures = [];
  const check = (name, ok, detail = "") => {
    if (!ok) failures.push(`${label}.${name}`);
    console.log(`${ok ? "ok" : "FAIL"}  ${label}.${name}${detail ? ` — ${detail}` : ""}`);
  };
  await page.waitForFunction(async () => {
    try {
      const res = await fetch("/api/auth/get-session", { credentials: "include" });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data?.user?.id || data?.user?.email);
    } catch {
      return false;
    }
  }, null, { timeout: 15_000 }).catch(() => {});
  const button =
    kind === "house"
      ? page.locator(".house-profile .house-follow").filter({ visible: true }).first()
      : page.locator("button").filter({ hasText: /^Follow$/ }).filter({ visible: true }).first();
  let shown = false;
  for (let attempt = 0; attempt < 3 && !shown; attempt++) {
    shown = await page.getByRole("button", { name: CHECK, exact: true }).filter({ visible: true }).first().isVisible().catch(() => false);
    if (shown) break;
    const gate = page.getByRole("dialog").filter({ hasText: "Sign in to follow" });
    if (await gate.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {});
      await gate.waitFor({ state: "hidden", timeout: 4_000 }).catch(() => {});
    }
    await button.click().catch(() => {});
    shown = await page.getByRole("button", { name: CHECK, exact: true }).filter({ visible: true }).first().waitFor({ timeout: 2_500 }).then(() => true).catch(() => false);
  }
  const on = await readFollow(page);
  if (kind === "profile" || kind === "house") {
    check("following-ghost", ghostProfile(on), on ? `${on.text} h ${on.height} bg ${on.bg} border ${on.borderWidth} ${on.borderColor}` : "missing");
  } else {
    const ink = kind === "look" || label.endsWith(".1280");
    check("following-text", Boolean(on) && on.text === CHECK && plainText(on, { ink }), on ? on.text : "missing");
  }
  const offButton = page.getByRole("button", { name: CHECK, exact: true }).filter({ visible: true }).first();
  await offButton.click().catch(() => {});
  await page.getByRole("button", { name: "Follow", exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8_000 }).catch(() => {});
  const off = await readFollow(page);
  check("toggle-back", off?.text === "Follow", off?.text || "missing");
  return failures;
}

async function creatorPath(page) {
  await gotoReady(page, LOOK);
  await page.locator("a.look-plate-kicker, .wide-panel-hd a.wide-kicker").first().waitFor({ timeout: 15_000 });
  const href = await page.locator("a.look-plate-kicker, .wide-panel-hd a.wide-kicker").first().getAttribute("href");
  return href || "";
}

async function main() {
  let failed = false;
  const browser = await chromium.launch();
  try {
    const guest = await boot(browser, VIEWPORTS[0]);
    let creator = "";
    try {
      creator = await creatorPath(guest.page);
    } finally {
      await guest.context.close();
    }
    if (!creator.startsWith("/creators/")) {
      console.log(`FAIL  creator-path — ${creator || "missing"}`);
      failed = true;
    }

    for (const viewport of VIEWPORTS) {
      const { context, page } = await boot(browser, viewport);
      try {
        const surfaces = [
          ["look", LOOK],
          ["feed", "/"],
          ["profile", creator],
          ["house", HOUSE],
        ];
        for (const [kind, path] of surfaces) {
          if (!path) continue;
          try {
            await gotoReady(page, path);
            if (kind === "feed") {
              await page.waitForFunction(() => {
                return [...document.querySelectorAll(".echo-plate, .wide-leadcard, .wide-lead-copy")].some((el) => {
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== "none" && rect.width > 40 && rect.height > 40;
                });
              });
            }
            if (kind === "look" && viewport.name !== "390") {
              await page.locator(".wide-look .wide-prow").first().waitFor({ timeout: 15_000 });
            }
            if (kind === "house") {
              await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 15_000 });
            }
            await page.getByRole("button", { name: "Follow", exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
            const failures = await assertGuestSurface(page, `${kind}.${viewport.name}`, kind);
            if (failures.length) failed = true;
          } catch (error) {
            failed = true;
            console.log(`FAIL  ${kind}.${viewport.name} — ${error instanceof Error ? error.message : error}`);
          }
        }
      } finally {
        await context.close();
      }
    }

    const signed = await boot(browser, VIEWPORTS[0]);
    try {
      await fillAdminLogin(signed.page, origin);
      for (const viewport of VIEWPORTS) {
        await signed.page.setViewportSize({ width: viewport.width, height: viewport.height });
        const surfaces = [
          ["look", LOOK],
          ["feed", "/"],
          ["profile", creator],
          ["house", HOUSE],
        ];
        for (const [kind, path] of surfaces) {
          if (!path) continue;
          try {
            await signed.page.evaluate(() => {
              localStorage.removeItem("looktag-followed-creators-v1");
              localStorage.removeItem("looktag-followed-houses-v1");
            });
            await gotoReady(signed.page, path);
            if (kind === "feed") {
              await signed.page.waitForFunction(() => {
                return [...document.querySelectorAll(".echo-plate, .wide-leadcard, .wide-lead-copy")].some((el) => {
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== "none" && rect.width > 40 && rect.height > 40;
                });
              });
            }
            await signed.page.getByRole("button", { name: "Follow", exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
            const failures = await assertSignedToggle(signed.page, `signed.${kind}.${viewport.name}`, kind);
            if (failures.length) failed = true;
          } catch (error) {
            failed = true;
            console.log(`FAIL  signed.${kind}.${viewport.name} — ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    } finally {
      await signed.context.close();
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) await main();
