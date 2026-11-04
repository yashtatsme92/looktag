import assert from "node:assert/strict";
import { chromium } from "playwright";
import { toJSON } from "seroval";
import { BOOT_SKIP_KEY, resolveAdminCredentials, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const credentials = resolveAdminCredentials();
const designs = [
  { id: "wordmark", label: "Wordmark", art: ".boot-splash-word", motion: ".boot-wordmark-line" },
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
    const word = getComputedStyle(el.querySelector(".boot-splash-word"));
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
      artWidth: art?.getBoundingClientRect().width ?? el.querySelector(".boot-wordmark-line")?.offsetWidth ?? 0,
      svgWidth: svg?.getBoundingClientRect().width ?? 0,
      background: getComputedStyle(el).backgroundColor,
      pins: el.querySelectorAll(".boot-splash-pin").length,
      count: el.querySelector(".boot-splash-count")?.textContent?.trim() ?? "",
      wordStyle: {
        fontFamily: word.fontFamily,
        fontStyle: word.fontStyle,
        fontWeight: word.fontWeight,
        color: word.color,
      },
      firstPinRadius: el.querySelector(".boot-piece-number")?.getAttribute("r"),
      firstPinColor: el.querySelector(".boot-piece-number") ? getComputedStyle(el.querySelector(".boot-piece-number")).fill : "",
      trousersFill: el.querySelector(".boot-piece-trousers") ? getComputedStyle(el.querySelector(".boot-piece-trousers")).fill : "",
      pillFill: el.querySelector(".boot-piece-label") ? getComputedStyle(el.querySelector(".boot-piece-label")).fill : "",
      kicker: el.querySelector(".boot-splash-kicker")?.textContent?.trim() ?? "",
      desktopLayout: getComputedStyle(el).display,
      contentOrder: [...el.children].map((child) =>
        child.classList.contains("boot-splash-mark") ? "word" :
          child.classList.contains("boot-splash-art") ? "art" :
            child.classList.contains("boot-splash-count") ? "count" : "other"
      ),
      overlap,
    };
  });
  assert.equal(rendered.root, design.id);
  assert.ok(rendered.artWidth > 0, `${design.id} artwork has no width`);
  assert.equal(rendered.background, "rgb(244, 244, 244)");
  assert.equal(rendered.wordStyle.fontFamily.includes("Playfair Display"), true);
  assert.equal(rendered.wordStyle.fontStyle, "italic");
  assert.equal(rendered.wordStyle.fontWeight, "500");
  assert.equal(rendered.wordStyle.color, "rgb(17, 17, 17)");
  if (design.id === "pieces" || design.id === "soft-power") {
    assert.ok(rendered.svgWidth > 0);
    if (viewport.width >= 768) assert.ok(rendered.svgWidth >= 300);
    assert.equal(rendered.pins, 4);
    assert.equal(rendered.count, "4 pieces tagged");
    assert.equal(rendered.overlap, false);
    assert.deepEqual(rendered.contentOrder, ["word", "art", "count"]);
    assert.equal(rendered.firstPinRadius, "14");
    assert.equal(rendered.firstPinColor, "rgb(17, 17, 17)");
    assert.equal(rendered.pillFill, "rgba(17, 17, 17, 0.62)");
    if (design.id === "soft-power") {
      assert.equal(rendered.trousersFill, "rgb(212, 212, 212)");
      assert.equal(await splash.getByText("Satin blouse").count(), 1);
    }
    if (viewport.width >= 768) assert.equal(rendered.desktopLayout, "grid");
  }
  if (design.id === "tag-draw") assert.equal(rendered.kicker, "SHOP THE LOOK");
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
  const firstPaint = await page.locator("#boot-splash-html").evaluate((el) => {
    const root = document.documentElement.getAttribute("data-splash");
    const frame = el.querySelector(`.boot-splash-static-frame[data-splash="${root}"]`);
    return {
      root,
      background: getComputedStyle(el).backgroundColor,
      artVisible: root === "wordmark"
        ? frame?.querySelector(".boot-wordmark-line")?.offsetWidth > 0
        : frame?.querySelector(".boot-splash-art")?.getBoundingClientRect().width > 0,
      wordmarkFirst: root === "pieces" || root === "soft-power"
        ? frame?.firstElementChild?.classList.contains("boot-splash-mark")
        : true,
    };
  });
  assert.equal(firstPaint.root, design.id);
  assert.equal(firstPaint.background, "rgb(244, 244, 244)");
  assert.equal(firstPaint.artVisible, true);
  assert.equal(firstPaint.wordmarkFirst, true);

  if (design.id === "wordmark") {
    const startupLinks = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((links) =>
      links.map((link) => ({ href: link.getAttribute("href"), media: link.getAttribute("media") })),
    );
    assert.equal(startupLinks.length, 14);
    assert.ok(startupLinks.every((link) => link.media.includes("orientation: portrait")));
    const imageSizes = await page.evaluate(async (links) => Promise.all(links.map(async ({ href }) => {
      const response = await fetch(href);
      const bytes = new DataView(await response.arrayBuffer());
      return {
        href,
        width: bytes.getUint32(16),
        height: bytes.getUint32(20),
      };
    })), startupLinks);
    for (const image of imageSizes) {
      assert.equal(image.href, `/splash-${image.width}x${image.height}.png`);
    }
    assert.ok(!startupLinks.some(({ href }) => href === "/splash-2048.png"));
  }

  await page.evaluate((key) => sessionStorage.setItem(key, "done"), BOOT_SKIP_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(
    await page.locator("#boot-splash-html").evaluate((el) => getComputedStyle(el).display),
    "none",
  );
  await context.close();

  const appContext = await browser.newContext({ viewport });
  const appPage = await appContext.newPage();
  const startedAt = Date.now();
  await appPage.goto(origin, { waitUntil: "domcontentloaded" });
  const splash = appPage.locator(`.boot-splash[data-boot][data-splash="${design.id}"]`);
  await splash.waitFor({ timeout: 10_000 });
  await splash.waitFor({ state: "detached", timeout: 12_000 });
  assert.ok(Date.now() - startedAt >= 1_200, `${design.id} ended before its animation cycle`);
  await appPage.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await appPage.locator(".boot-splash[data-boot]").count(), 0, `${design.id} replayed`);
  await appContext.close();
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
