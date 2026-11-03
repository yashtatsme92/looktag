#!/usr/bin/env node
/**
 * iOS home-screen app (#209): standalone iPhone with safe-area insets and a visualViewport
 * that excludes the bottom inset. The tab bar must sit flush at the viewport bottom and the
 * screen must fill the full height on Looks, Create and You.
 */
import { chromium } from "playwright";
import { resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const viewport = { width: 390, height: 844 };
const INSET_BOTTOM = 34;
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function emulateStandalone(page) {
  await page.addInitScript(
    ({ bottom, height }) => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /display-mode:\s*standalone/.test(q)
          ? Object.assign(real("(min-width: 0px)"), { media: q })
          : real(q);
      Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
      // iOS standalone reports a visual viewport shorter than the screen.
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: Object.assign(new EventTarget(), {
          height: height - bottom,
          width: 390,
          offsetTop: 0,
          offsetLeft: 0,
          scale: 1,
        }),
      });
    },
    { bottom: INSET_BOTTOM, height: viewport.height },
  );
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

const browser = await chromium.launch();
try {
  await withPage(
    browser,
    origin,
    async (page) => {
      await emulateStandalone(page);
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await page.locator(".tab-bar").waitFor({ timeout: 10_000 });
      const m = await measure(page);
      record("ios-standalone.looks.no-pinned-height", m.appHeight === "", JSON.stringify(m));
      record(
        "ios-standalone.looks.tab-bar-flush",
        m.barBottom === m.innerHeight && m.screenBottom === m.innerHeight && m.screenTop === 0,
        JSON.stringify(m),
      );
      for (const name of ["Houses", "You"]) {
        await page.locator(".tab-bar").getByRole("link", { name }).click();
        await page.waitForTimeout(500);
        const n = await measure(page);
        record(
          `ios-standalone.${name.toLowerCase()}.tab-bar-flush`,
          n.barBottom === n.innerHeight,
          JSON.stringify(n),
        );
      }
      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
      await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 10_000 });
      const c = await measure(page);
      record(
        "ios-standalone.create.fills-height",
        c.screenBottom === null || c.screenBottom === c.innerHeight,
        JSON.stringify(c),
      );
    },
    "ios-standalone",
    { viewport },
  );
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
