import assert from "node:assert/strict";
import { chromium } from "playwright";
import { toJSON } from "seroval";
import { BOOT_SKIP_KEY, resolveAdminCredentials, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const credentials = resolveAdminCredentials();
const designs = [
  { id: "wordmark", label: "Wordmark", art: ".boot-art-wordmark", motion: ".boot-wordmark-line" },
  { id: "tag-draw", label: "Tag draw", art: ".boot-art-tag", motion: ".boot-tag-outline" },
  { id: "pieces", label: "Drawn pieces reveal", art: ".boot-art-pieces", motion: ".boot-piece-lines path" },
  { id: "soft-power", label: "Elegant “soft power”", art: ".boot-art-pieces", motion: ".boot-piece-lines path" },
];
const viewports = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 834, height: 1112 },
  { width: 1440, height: 900 },
];
const browser = await chromium.launch({ headless: true });

async function selectSplash(page, label) {
  const radio = page.getByRole("radio", { name: label });
  const checked =
    (await radio.getAttribute("data-state")) === "checked" ||
    (await radio.getAttribute("aria-checked")) === "true";
  if (checked) return;
  await radio.click();
  await page.getByText("Saving…", { exact: true }).waitFor({ timeout: 4_000 });
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 8_000 });
}

async function previewSplash(page, design, viewport) {
  await page.setViewportSize(viewport);
  await page.getByRole("button", { name: "Play" }).click();
  const splash = page.locator(`.boot-splash[data-boot][data-splash="${design.id}"]`);
  await splash.waitFor({ timeout: 5_000 });
  const artwork = splash.locator(design.art);
  await artwork.waitFor({ state: "visible", timeout: 3_000 });

  const rendered = await splash.evaluate((el) => {
    const art = el.querySelector(".boot-splash-art");
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
      artWidth: art?.getBoundingClientRect().width ?? 0,
      svgWidth: svg?.getBoundingClientRect().width ?? 0,
      background: getComputedStyle(el).backgroundColor,
      pins: el.querySelectorAll(".boot-splash-pin").length,
      count: el.querySelector(".boot-splash-count")?.textContent?.trim() ?? "",
      overlap,
    };
  });
  assert.equal(rendered.root, design.id);
  assert.ok(rendered.artWidth > 0, `${design.id} artwork has no width`);
  assert.equal(rendered.background, "rgb(244, 244, 244)");
  if (design.id === "pieces" || design.id === "soft-power") {
    assert.ok(rendered.svgWidth > 0);
    if (viewport.width >= 768) assert.ok(rendered.svgWidth >= 300);
    assert.equal(rendered.pins, 4);
    assert.equal(rendered.count, "4 pieces tagged");
    assert.equal(rendered.overlap, false);
  }
  await splash.waitFor({ state: "detached", timeout: 5_000 });
}

async function checkColdStart(browser, design, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.resourceType() === "script" && new URL(request.url()).origin === origin) {
      return route.abort();
    }
    return route.continue();
  });

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const firstPaint = await page.locator("#boot-splash-html").evaluate((el) => ({
    root: document.documentElement.getAttribute("data-splash"),
    splash: el.getAttribute("data-splash"),
    background: getComputedStyle(el).backgroundColor,
    artVisible: el.querySelector(".boot-splash-art")?.getBoundingClientRect().width > 0,
  }));
  assert.equal(firstPaint.root, design.id);
  assert.equal(firstPaint.splash, design.id);
  assert.equal(firstPaint.background, "rgb(244, 244, 244)");
  assert.equal(firstPaint.artVisible, true);

  await page.waitForFunction(
    (key) => sessionStorage.getItem(key) === "done",
    BOOT_SKIP_KEY,
    { timeout: 5_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  const replay = await page.locator("#boot-splash-html").evaluate((el) => ({
    root: document.documentElement.getAttribute("data-splash"),
    hidden: getComputedStyle(el).display === "none",
  }));
  assert.equal(replay.root, design.id);
  assert.equal(replay.hidden, true, `${design.id} splash replayed after reload`);
  await context.close();
}

async function checkReducedMotion(page, design) {
  await selectSplash(page, design.label);
  await page.setViewportSize(viewports[1]);
  await page.getByRole("button", { name: "Play" }).click();
  const splash = page.locator(`.boot-splash[data-boot][data-splash="${design.id}"]`);
  await splash.waitFor({ timeout: 5_000 });
  const motion = await splash.evaluate((el, selector) => {
    const art = el.querySelector(selector);
    const word = el.querySelector(".boot-splash-word");
    return {
      animation: art ? getComputedStyle(art).animationName : "",
      dashOffset: art ? getComputedStyle(art).strokeDashoffset : "",
      wordAnimation: word ? getComputedStyle(word).animationName : "",
      wordTransform: word ? getComputedStyle(word).transform : "",
    };
  }, design.motion);
  assert.equal(motion.animation, "none", `${design.id} artwork animates with reduced motion`);
  if (design.id !== "wordmark") assert.equal(Number.parseFloat(motion.dashOffset), 0);
  assert.equal(motion.wordAnimation, "none");
  assert.equal(motion.wordTransform, "none");
  await splash.waitFor({ state: "detached", timeout: 5_000 });
}

async function rejectUnknownSplash(page) {
  const fn = Buffer.from(
    JSON.stringify({
      file: "/src/lib/settings/api.ts?tss-serverfn-split",
      export: "saveAppSettings_createServerFn_handler",
    }),
  ).toString("base64url");
  const body = JSON.stringify(toJSON({ data: { splashId: "neon" }, context: {} }));
  const status = await page.evaluate(async ({ fn, body }) => {
    const response = await fetch(`/_serverFn/${fn}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-tsr-serverfn": "true" },
      body,
    });
    return response.status;
  }, { fn, body });
  assert.equal(status, 400, "unknown splash id must be rejected");
}

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  await page.goto(`${origin}/login?next=${encodeURIComponent("/admin/studio")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 10_000 });
  await page.locator("#creator-email").fill(
    credentials.email.toLowerCase() === "hello@thelooktag.com" ? "admin" : credentials.email,
  );
  await page.locator("#creator-password").fill(credentials.password);
  await page.locator("form").getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin"), { timeout: 20_000 });
  await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded" });

  for (const [index, design] of designs.entries()) {
    await selectSplash(page, design.label);
    await checkColdStart(browser, design, viewports[index]);
    for (const viewport of viewports) {
      await previewSplash(page, design, viewport);
    }
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const design of designs) await checkReducedMotion(page, design);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await selectSplash(page, "Tag draw");
  await page.setViewportSize(viewports[0]);
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator('.boot-splash[data-boot][data-splash="tag-draw"]').waitFor({ timeout: 5_000 });
  await page.locator('.boot-splash[data-boot][data-splash="tag-draw"]').waitFor({
    state: "detached",
    timeout: 5_000,
  });
  await rejectUnknownSplash(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("html.boot-react").waitFor({ timeout: 10_000 });
  assert.equal(await page.locator(".boot-splash[data-boot]").count(), 0, "splash replayed after reload");
  const tagDraw = page.getByRole("radio", { name: "Tag draw" });
  await tagDraw.waitFor({ timeout: 10_000 });
  assert.ok(
    (await tagDraw.getAttribute("data-state")) === "checked" ||
      (await tagDraw.getAttribute("aria-checked")) === "true",
    "invalid splash id overwrote the saved choice",
  );
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), BOOT_SKIP_KEY), "done");
  await context.close();
} finally {
  await browser.close();
}

console.log("splash designs ok");
