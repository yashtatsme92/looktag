import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  BOOT_SKIP_KEY,
  BROWSE_COACH_KEY,
  resolveAdminCredentials,
  resolveOrigin,
  STYLE_GUIDE_KEY,
} from "./helpers.mjs";

const origin = resolveOrigin();
const credentials = resolveAdminCredentials();
const designs = [
  { id: "wordmark", label: "Wordmark", art: ".boot-art-wordmark" },
  { id: "tag-draw", label: "Tag draw", art: ".boot-art-tag" },
  { id: "pieces", label: "Drawn pieces reveal", art: ".boot-art-pieces" },
  { id: "soft-power", label: "Elegant “soft power”", art: ".boot-art-pieces" },
];
const viewports = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 834, height: 1112 },
  { width: 1440, height: 900 },
];
const browser = await chromium.launch({ headless: true });
let adminContext;
let admin;

try {
  adminContext = await browser.newContext();
  admin = await adminContext.newPage();
  await admin.goto(`${origin}/login?next=${encodeURIComponent("/admin/studio")}`, {
    waitUntil: "domcontentloaded",
  });
  await admin.locator("form[data-hydrated='true']").waitFor({ timeout: 10_000 });
  await admin.locator("#creator-email").fill(
    credentials.email.toLowerCase() === "hello@thelooktag.com" ? "admin" : credentials.email,
  );
  await admin.locator("#creator-password").fill(credentials.password);
  await admin.locator("form").getByRole("button", { name: "Sign in with email" }).click();
  await admin.waitForURL((url) => url.pathname.startsWith("/admin"), { timeout: 20_000 });
  await admin.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded" });

  for (const design of designs) {
    await admin.getByRole("radio", { name: design.label }).click();
    await admin.getByText("Saving…", { exact: true }).waitFor({ timeout: 4_000 });
    await admin.getByText("Saved", { exact: true }).waitFor({ timeout: 8_000 });

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: viewport.width < 500 ? 2 : 1,
      });
      await context.addInitScript(
        ({ guide, coach, boot }) => {
          localStorage.setItem(guide, "done");
          localStorage.setItem(coach, "done");
          sessionStorage.removeItem(boot);
        },
        { guide: STYLE_GUIDE_KEY, coach: BROWSE_COACH_KEY, boot: BOOT_SKIP_KEY },
      );
      const page = await context.newPage();
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      const splash = page.locator(`.boot-splash[data-boot][data-splash="${design.id}"]`);
      await splash.waitFor({ timeout: 10_000 });

      const rendered = await splash.evaluate((el, artSelector) => {
        const art = el.querySelector(artSelector);
        const svg = el.querySelector(".boot-art-pieces svg");
        const overlap = svg
          ? [...svg.querySelectorAll(".boot-piece-label")].some((label) => {
              const labelBox = label.getBBox();
              return [...svg.querySelectorAll(".boot-piece-lines path")].some((path) => {
                const pieceBox = path.getBBox();
                return (
                  labelBox.x < pieceBox.x + pieceBox.width &&
                  labelBox.x + labelBox.width > pieceBox.x &&
                  labelBox.y < pieceBox.y + pieceBox.height &&
                  labelBox.y + labelBox.height > pieceBox.y
                );
              });
            })
          : false;
        return {
          root: document.documentElement.getAttribute("data-splash"),
          artVisible: Boolean(art && art.getBoundingClientRect().width > 0),
          background: getComputedStyle(el).backgroundColor,
          pins: el.querySelectorAll(".boot-splash-pin").length,
          count: el.querySelector(".boot-splash-count")?.textContent?.trim() ?? "",
          overlap,
        };
      }, design.art);
      assert.equal(rendered.root, design.id);
      assert.equal(rendered.artVisible, true);
      assert.equal(rendered.background, "rgb(244, 244, 244)");
      if (design.id === "pieces" || design.id === "soft-power") {
        assert.equal(rendered.pins, 4);
        assert.equal(rendered.count, "4 pieces tagged");
        assert.equal(rendered.overlap, false);
      }

      await page.locator(".boot-splash[data-boot]").waitFor({ state: "detached", timeout: 5_000 });
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      await page.locator("#boot-splash-html").waitFor({ state: "hidden", timeout: 5_000 });
      await context.close();
    }
  }

  const reducedContext = await browser.newContext({
    viewport: viewports[1],
    reducedMotion: "reduce",
  });
  await reducedContext.addInitScript(
    ({ guide, coach, boot }) => {
      localStorage.setItem(guide, "done");
      localStorage.setItem(coach, "done");
      sessionStorage.removeItem(boot);
    },
    { guide: STYLE_GUIDE_KEY, coach: BROWSE_COACH_KEY, boot: BOOT_SKIP_KEY },
  );
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  const reducedSplash = reducedPage.locator('.boot-splash[data-boot][data-splash="soft-power"]');
  await reducedSplash.waitFor({ timeout: 10_000 });
  const motion = await reducedSplash.locator(".boot-piece-lines path").first().evaluate((el) => ({
    animation: getComputedStyle(el).animationName,
    dashOffset: getComputedStyle(el).strokeDashoffset,
  }));
  assert.equal(motion.animation, "none");
  assert.equal(Number.parseFloat(motion.dashOffset), 0);
  await reducedContext.close();
} finally {
  if (admin && adminContext) {
    try {
      await admin.getByRole("radio", { name: "Tag draw" }).click();
      await admin.getByText("Saving…", { exact: true }).waitFor({ timeout: 4_000 });
      await admin.getByText("Saved", { exact: true }).waitFor({ timeout: 8_000 });
    } catch {
      // The selected option may already be Tag draw, or the test may have failed before sign-in.
    }
    await adminContext.close();
  }
  await browser.close();
}

console.log("splash designs ok");
