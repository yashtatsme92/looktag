import { mkdirSync } from "node:fs";
import { checkedUrl } from "../../scripts/browser-guard.mjs";

export const STYLE_GUIDE_KEY = "looktag-style-guide-v1";
export const BROWSE_COACH_KEY = "looktag-browse-coach-v1";
export const BOOT_SKIP_KEY = "looktag-boot-v1";
export const SPLASH_STORAGE_KEY = "looktag-splash-v1";
export const SCREENSHOT_DIR = "/workspace/screenshots";

export function resolveOrigin() {
  return checkedUrl(process.argv[2] ?? "http://127.0.0.1:8080");
}

/** Admin credentials for e2e — never hardcode a password in source. */
export function resolveAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || "admin@looktag.studio").trim();
  const password = (process.env.ADMIN_BOOTSTRAP_PASSWORD || "").trim();
  if (!password) {
    throw new Error(
      "ADMIN_BOOTSTRAP_PASSWORD is required for admin e2e flows. See CONTRIBUTING.md.",
    );
  }
  return { email, password };
}

export function snippet(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function productUrl(href) {
  if (!href) return false;
  try {
    const url = new URL(href);
    if (url.pathname === "/" || url.pathname === "") return false;
    return /zalando|zara|cos|uniqlo|arket|mango|sezane|stories|massimodutti|hm\.com/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function withPage(browser, origin, fn, shotName = "flow", options = {}) {
  const viewport = options.viewport ?? { width: 390, height: 844 };
  const deviceScaleFactor = options.deviceScaleFactor ?? (viewport.width < 500 ? 2 : 1);
  const context = await browser.newContext({
    viewport,
    locale: "en-GB",
    deviceScaleFactor,
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
  page.setDefaultTimeout(12_000);
  try {
    return await fn(page, origin);
  } catch (error) {
    try {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/e2e-${shotName}.png`,
        fullPage: false,
      });
    } catch {
      /* screenshot is best-effort */
    }
    throw error;
  } finally {
    await context.close();
  }
}

export async function getSession(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    return res.json();
  });
}

export async function waitForApp(page) {
  await page.getByRole("navigation", { name: "App" }).waitFor({ timeout: 10_000 });
}

export async function waitForFeed(page) {
  await page.locator(".look-feed-stage[data-feed-ready='true']").waitFor({ timeout: 10_000 });
  await page.locator("[data-feed-slide] .look-slide-hit").first().waitFor({ timeout: 8_000 });
}

export async function withBootPage(browser, origin, splashId, fn, shotName = "boot") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-GB",
    deviceScaleFactor: 2,
  });
  await context.addInitScript(
    ([guide, coach, splashKey, splash, bootKey]) => {
      try {
        localStorage.setItem(guide, "done");
        localStorage.setItem(coach, "done");
        localStorage.setItem(splashKey, splash);
        sessionStorage.removeItem(bootKey);
        window.__splashLog = [];
        const note = () => {
          const html = document.documentElement?.getAttribute("data-splash") || "";
          const overlay = document.querySelector(".boot-splash");
          const overlayId = overlay?.getAttribute("data-splash") || "";
          const pins = overlay ? overlay.querySelectorAll(".boot-splash-pin").length : 0;
          const last = window.__splashLog[window.__splashLog.length - 1];
          if (
            last &&
            last.html === html &&
            last.overlay === overlayId &&
            last.pins === pins
          ) {
            return;
          }
          window.__splashLog.push({ html, overlay: overlayId, pins });
        };
        const orig = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name, value) {
          const ret = orig.call(this, name, value);
          if (name === "data-splash") queueMicrotask(note);
          return ret;
        };
        const mo = new MutationObserver(note);
        const start = () => {
          mo.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["data-splash"],
          });
          note();
        };
        if (document.documentElement) start();
        else document.addEventListener("DOMContentLoaded", start);
      } catch {
        /* private mode */
      }
    },
    [STYLE_GUIDE_KEY, BROWSE_COACH_KEY, SPLASH_STORAGE_KEY, splashId, BOOT_SKIP_KEY],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  try {
    return await fn(page, origin);
  } catch (error) {
    try {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/e2e-${shotName}.png`,
        fullPage: false,
      });
    } catch {
      /* screenshot is best-effort */
    }
    throw error;
  } finally {
    await context.close();
  }
}

export async function chromeState(page) {
  return page.evaluate(() => {
    const tab = document.querySelector(".tab-bar");
    const header = document.querySelector(".web-header");
    const slide = document.querySelector(".look-slide");
    const photo = document.querySelector(".look-layout-photo");
    const vw = window.innerWidth;
    return {
      vw,
      tabDisplay: tab ? getComputedStyle(tab).display : "missing",
      headerDisplay: header ? getComputedStyle(header).display : "missing",
      slideWidth: slide ? Math.round(slide.getBoundingClientRect().width) : 0,
      photoWidth: photo ? Math.round(photo.getBoundingClientRect().width) : 0,
      chrome: document.documentElement.getAttribute("data-chrome"),
      layoutWeb: document.documentElement.classList.contains("layout-web"),
    };
  });
}


export async function isSwitchOn(locator) {
  const state = await locator.getAttribute("data-state");
  if (state === "checked") return true;
  if (state === "unchecked") return false;
  return (await locator.getAttribute("aria-checked")) === "true";
}

export async function setSwitch(locator, on) {
  await locator.waitFor({ timeout: 8_000 });
  const page = locator.page();
  const current = await isSwitchOn(locator);
  if (current === on) return;
  const label = (await locator.getAttribute("aria-label")) || "";
  const key = label.replace(/^(Hide|Show)\s+/i, "");
  await locator.click({ force: true });
  const changed = await page
    .waitForFunction(
      ({ key: suffix, want }) => {
        const el = [...document.querySelectorAll('[role="switch"]')].find((node) =>
          (node.getAttribute("aria-label") || "").includes(suffix),
        );
        if (!el) return false;
        const state = el.getAttribute("data-state");
        const checked = el.getAttribute("aria-checked") === "true" || state === "checked";
        return checked === want;
      },
      { key, want: on },
      { timeout: 3_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!changed) {
    await page.evaluate(
      ({ suffix, want }) => {
        const el = [...document.querySelectorAll('[role="switch"]')].find((node) =>
          (node.getAttribute("aria-label") || "").includes(suffix),
        );
        if (!el) return;
        const state = el.getAttribute("data-state");
        const checked = el.getAttribute("aria-checked") === "true" || state === "checked";
        if (checked !== want) el.click();
      },
      { suffix: key, want: on },
    );
    await page.waitForTimeout(400);
  }
  await page.getByText(/Studio updated|Could not save/i).first().waitFor({ timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(200);
}

export async function fillSignup(page, origin, { name, email, password, handle, city }) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("#creator-email").waitFor({ timeout: 8_000 });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 }).catch(() => {});
  const nameField = page.locator("#creator-name");
  if ((await nameField.count()) === 0 || !(await nameField.isVisible().catch(() => false))) {
    const createTab = page.getByRole("button", { name: "Create account" }).first();
    await createTab.scrollIntoViewIfNeeded();
    await createTab.click();
    try {
      await nameField.waitFor({ timeout: 2_000 });
    } catch {
      await createTab.click({ force: true });
      await nameField.waitFor({ timeout: 4_000 });
    }
  }
  await nameField.scrollIntoViewIfNeeded();
  await nameField.fill(name);
  const handleField = page.locator("#creator-handle");
  if ((await handleField.count()) > 0 && handle) {
    await handleField.fill(handle);
  }
  const cityField = page.locator("#creator-city");
  if ((await cityField.count()) > 0 && city) {
    await cityField.fill(city);
  }
  await page.locator("#creator-email").fill(email);
  await page.locator("#creator-password").fill(password);
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
}

export async function fillAdminLogin(page, origin) {
  const { email: adminEmail, password: adminPassword } = resolveAdminCredentials();
  const session = await getSession(page).catch(() => null);
  const email = String(session?.user?.email || "").toLowerCase();
  if (email === adminEmail.toLowerCase()) return;
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await waitForApp(page).catch(() => {});
  await page.waitForTimeout(800);
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  const alreadyIn = await page.waitForFunction(
    () => !location.pathname.startsWith("/login"),
    null,
    { timeout: 2_000 },
  ).then(() => true).catch(() => false);
  if (alreadyIn) return;
  await page.locator("#creator-email").waitFor({ timeout: 8_000 });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 }).catch(() => {});
  const signInTab = page.getByRole("button", { name: "Sign in" }).first();
  if (await signInTab.count()) {
    await signInTab.click().catch(() => {});
  }
  const alias =
    adminEmail.toLowerCase() === "admin@looktag.studio" ? "admin" : adminEmail;
  await page.locator("#creator-email").fill(alias);
  await page.locator("#creator-password").fill(adminPassword);
  await page.locator("form").getByRole("button", { name: "Sign in with email" }).click();
  try {
    await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 12_000 });
  } catch {
    await page.waitForTimeout(1200);
    await page.locator("#creator-email").fill(adminEmail);
    await page.locator("#creator-password").fill(adminPassword);
    await page.locator("form").getByRole("button", { name: "Sign in with email" }).click();
    await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 12_000 });
  }
}

export async function restoreStudioDefaults(page, origin) {
  await fillAdminLogin(page, origin);
  await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator('[data-hydrated="true"]').waitFor({ timeout: 10_000 });
  await page.locator("#score-look").waitFor({ timeout: 10_000 });
  const google = page.getByRole("switch", { name: /Google sign-up/i });
  const email = page.getByRole("switch", { name: /Email sign-up/i });
  const x = page.getByRole("switch", { name: /X sign-up/i });
  const houses = page.getByRole("switch", { name: "Show Houses" });
  if (await google.count()) await setSwitch(google, true);
  if (await email.count()) await setSwitch(email, true);
  if (await x.count()) await setSwitch(x, true);
  if (await houses.count()) await setSwitch(houses, true);
  const look = page.locator("#score-look");
  if (await look.count()) {
    await look.fill("12");
    await look.blur();
    await page.locator("#score-pin").fill("3");
    await page.locator("#score-pin").blur();
    await page.locator("#score-compared").fill("5");
    await page.locator("#score-compared").blur();
    await page.getByText(/Studio updated/i).first().waitFor({ timeout: 4_000 }).catch(() => {});
  }
  const country = page.locator("#search-country");
  if (await country.count()) {
    const value = await country.inputValue();
    if (value.toUpperCase() !== "DE") {
      await country.selectOption("DE");
      await page.getByText(/Studio updated/i).first().waitFor({ timeout: 4_000 }).catch(() => {});
    }
  }
  const classy = page.getByRole("radio", { name: "Classy" });
  if (await classy.count()) {
    const on =
      (await classy.getAttribute("data-state")) === "checked" ||
      (await classy.getAttribute("aria-checked")) === "true";
    if (!on) {
      await classy.scrollIntoViewIfNeeded();
      await classy.click();
      await page.getByText(/Studio updated/i).first().waitFor({ timeout: 4_000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(300);
}

export async function clippedTitles(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll(
      "h1, h2, h3, .ds-screen-title, .ds-section-title, .ds-card-title, .native-header-title",
    );
    const clipped = [];
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.getClientRects().length === 0) continue;
      const style = getComputedStyle(el);
      const clamp = style.webkitLineClamp;
      const ellipsis = style.textOverflow === "ellipsis" || Boolean(clamp && clamp !== "none");
      const horizontal = el.scrollWidth > el.clientWidth + 2;
      const vertical = ellipsis && el.scrollHeight > el.clientHeight + 3;
      if (horizontal || vertical) {
        clipped.push((el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80));
      }
    }
    return clipped;
  });
}

export async function pageOverflows(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
}
