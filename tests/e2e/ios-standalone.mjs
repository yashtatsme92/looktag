#!/usr/bin/env node
/**
 * iOS home-screen app (#209): standalone iPhone whose visualViewport is shorter than the
 * window (no keyboard open). The tab bar must sit flush at the window bottom and the screen
 * must fill the full height on Looks, Houses, You and Create. Chromium cannot set
 * env(safe-area-inset-*), so the top inset is checked on the shipped CSS rules.
 */
import { chromium } from "playwright";
import { resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const CASES = [
  { name: "iphone-14", width: 390, height: 844, shortfall: 34 },
  { name: "iphone-14-130", width: 390, height: 844, shortfall: 130 },
  { name: "iphone-13-mini", width: 375, height: 812, shortfall: 34 },
  { name: "iphone-se", width: 375, height: 667, shortfall: 0 },
];

const FOCUS_CASES = [
  { name: "iphone-14", width: 390, height: 844, shortfall: 34 },
  { name: "iphone-14-130", width: 390, height: 844, shortfall: 130 },
  { name: "ipad", width: 834, height: 1194, shortfall: 20 },
];

async function emulateStandalone(page, shortfall) {
  await page.addInitScript((shortfall) => {
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
    // iOS standalone reports a visual viewport shorter than the window.
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () =>
        Object.assign(new EventTarget(), {
          height: window.innerHeight - shortfall,
          width: window.innerWidth,
          offsetTop: 0,
          offsetLeft: 0,
          scale: 1,
        }),
    });
  }, shortfall);
}

async function measure(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".tab-bar")?.getBoundingClientRect();
    const screen = document.querySelector(".native-screen")?.getBoundingClientRect();
    return {
      barBottom: bar ? Math.round(bar.bottom) : null,
      screenTop: screen ? Math.round(screen.top) : null,
      screenBottom: screen ? Math.round(screen.bottom) : null,
      innerHeight: window.innerHeight,
      appHeight: document.documentElement.style.getPropertyValue("--app-height"),
    };
  });
}

async function headerUsesTopInset(page) {
  return page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (
          rule.selectorText === ".native-header" &&
          /env\(safe-area-inset-top/.test(rule.cssText)
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

const browser = await chromium.launch();
try {
  for (const c of CASES) {
    await withPage(
      browser,
      origin,
      async (page) => {
        await emulateStandalone(page, c.shortfall);
        await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        await page.locator(".tab-bar").waitFor({ timeout: 10_000 });
        const m = await measure(page);
        record(`ios-standalone.${c.name}.looks.not-pinned`, m.appHeight === "", JSON.stringify(m));
        record(
          `ios-standalone.${c.name}.looks.flush`,
          m.barBottom === m.innerHeight && m.screenBottom === m.innerHeight && m.screenTop === 0,
          JSON.stringify(m),
        );
        record(`ios-standalone.${c.name}.header-top-inset`, await headerUsesTopInset(page));
        for (const name of ["Houses", "You"]) {
          await page.locator(".tab-bar").getByRole("link", { name }).click();
          await page.waitForTimeout(500);
          const n = await measure(page);
          record(
            `ios-standalone.${c.name}.${name.toLowerCase()}.flush`,
            n.barBottom === n.innerHeight,
            JSON.stringify(n),
          );
        }
        await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
        await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 10_000 });
        const s = await measure(page);
        record(
          `ios-standalone.${c.name}.create.fills-height`,
          s.appHeight === "" && (s.screenBottom === null || s.screenBottom === s.innerHeight),
          JSON.stringify(s),
        );
      },
      `ios-standalone-${c.name}`,
      { viewport: { width: c.width, height: c.height } },
    );
  }
  // A focused text field with no on-screen keyboard (hardware keyboard, iPad) must not pin the height.
  for (const c of FOCUS_CASES) {
    await withPage(
      browser,
      origin,
      async (page) => {
        await emulateStandalone(page, c.shortfall);
        await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        await page
          .locator("html.boot-done, .tab-bar")
          .first()
          .waitFor({ state: "attached", timeout: 10_000 });
        await page.evaluate(() => {
          const input = document.createElement("input");
          input.type = "text";
          input.id = "e2e-focus-field";
          input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
          document.body.append(input);
        });
        await page.waitForTimeout(300);
        await page.locator("#e2e-focus-field").focus();
        await page.waitForTimeout(300);
        const m = await measure(page);
        const phone = c.width < 768;
        record(
          `ios-standalone.${c.name}.focus-no-shrink.not-pinned`,
          m.appHeight === "" && (!phone || m.screenBottom === m.innerHeight),
          JSON.stringify(m),
        );
        if (phone) {
          record(
            `ios-standalone.${c.name}.focus-no-shrink.flush`,
            m.barBottom === m.innerHeight,
            JSON.stringify(m),
          );
        }
      },
      `ios-standalone-focus-${c.name}`,
      { viewport: { width: c.width, height: c.height } },
    );
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
