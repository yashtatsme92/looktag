import assert from "node:assert/strict";
import { chromium } from "playwright";
import { toJSON } from "seroval";
import { BOOT_SKIP_KEY, resolveAdminCredentials, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const credentials = resolveAdminCredentials();
const designs = [
  { id: "wordmark", label: "Wordmark", art: ".boot-splash-word", motion: ".boot-wordmark-line" },
  { id: "tag-draw", label: "Tag draw", art: ".boot-art-tag", motion: ".boot-tag-outline" },
  {
    id: "pieces",
    label: "Drawn pieces reveal",
    art: ".boot-art-pieces",
    motion: ".boot-splash-pin",
  },
  {
    id: "soft-power",
    label: "Elegant “soft power”",
    art: ".boot-art-pieces",
    motion: ".boot-splash-pin",
  },
];
const settingsServerFn = Buffer.from(
  JSON.stringify({
    file: "/src/lib/settings/api.ts?tss-serverfn-split",
    export: "saveAppSettings_createServerFn_handler",
  }),
).toString("base64url");
const viewports = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 834, height: 1194 },
  { width: 1280, height: 800 },
];
const browser = await chromium.launch({ headless: true });

async function selectSplash(page, label) {
  const radio = page.getByRole("radio", { name: label });
  const checked =
    (await radio.getAttribute("data-state")) === "checked" ||
    (await radio.getAttribute("aria-checked")) === "true";
  if (checked) return;
  await page
    .locator(".save-status")
    .waitFor({ state: "detached", timeout: 4_000 })
    .catch(() => {});
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/_serverFn/${settingsServerFn}`) &&
      response.request().method() === "POST",
    { timeout: 8_000 },
  );
  await radio.click();
  const response = await saved;
  assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => {
      const status = document.querySelector(".save-status");
      return status?.textContent?.trim() === "Saved" || status?.classList.contains("is-error");
    },
    null,
    { timeout: 8_000 },
  );
  assert.equal(
    await page.locator(".save-status").textContent(),
    "Saved",
    "splash setting failed to save",
  );
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
    const svg = el.querySelector(".boot-art-pieces svg, .boot-art-tag svg");
    const word = getComputedStyle(el.querySelector(".boot-splash-word"));
    const firstPin = el.querySelector(".boot-splash-pin");
    const firstLabel = el.querySelector(".boot-piece-label");
    const mark = el.querySelector(".boot-splash-mark");
    const count = el.querySelector(".boot-splash-count");
    const box = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null;
    };
    const labelsConnected = [...el.querySelectorAll(".boot-piece-label")].every((label, index) => {
      const pin = el.querySelector(`.boot-splash-pin[data-pin="${index + 1}"]`);
      const labelBox = label.getBoundingClientRect();
      const pinBox = pin.getBoundingClientRect();
      return label.classList.contains("boot-piece-label-left")
        ? labelBox.right <= pinBox.left
        : labelBox.left >= pinBox.right;
    });
    return {
      root: document.documentElement.getAttribute("data-splash"),
      artWidth:
        art?.getBoundingClientRect().width ??
        el.querySelector(".boot-wordmark-line")?.offsetWidth ??
        0,
      artLeft: art?.getBoundingClientRect().left ?? 0,
      artRight: art?.getBoundingClientRect().right ?? 0,
      svgWidth: svg?.getBoundingClientRect().width ?? 0,
      svgViewBox: svg?.getAttribute("viewBox") ?? "",
      background: getComputedStyle(el).backgroundColor,
      pins: el.querySelectorAll(".boot-splash-pin").length,
      count: count?.textContent?.trim() ?? "",
      wordStyle: {
        fontFamily: word.fontFamily,
        fontStyle: word.fontStyle,
        fontWeight: word.fontWeight,
        color: word.color,
        fontSize: word.fontSize,
      },
      firstPinSize: firstPin ? getComputedStyle(firstPin).width : "",
      firstPinColor: firstPin ? getComputedStyle(firstPin).backgroundColor : "",
      pinDuration: firstPin ? getComputedStyle(firstPin).animationDuration : "",
      pinDelay: firstPin ? getComputedStyle(firstPin).animationDelay : "",
      labelDelay: firstLabel ? getComputedStyle(firstLabel).animationDelay : "",
      labelBackground: firstLabel ? getComputedStyle(firstLabel).backgroundColor : "",
      trousersFill: svg?.querySelector('[fill="#D4D4D4"]')
        ? getComputedStyle(svg.querySelector('[fill="#D4D4D4"]')).fill
        : "",
      artworkFills: [...(svg?.querySelectorAll("[fill]") ?? [])].map((node) =>
        node.getAttribute("fill"),
      ),
      kicker: el.querySelector(".boot-splash-kicker")?.textContent?.trim() ?? "",
      desktopLayout: getComputedStyle(el).display,
      wordBox: box(mark),
      artBox: box(art),
      countBox: box(count),
      labelsConnected,
      labelsInBounds: [...el.querySelectorAll(".boot-piece-label")].every((label) => {
        const bounds = label.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }),
    };
  });
  assert.equal(rendered.root, design.id);
  assert.ok(rendered.artWidth > 0, `${design.id} artwork has no width`);
  assert.equal(rendered.background, "rgb(244, 244, 244)");
  assert.ok(
    rendered.artLeft >= 0 && rendered.artRight <= viewport.width,
    `${design.id} artwork overflows viewport`,
  );
  assert.equal(rendered.wordStyle.fontFamily.includes("Playfair Display"), true);
  assert.equal(rendered.wordStyle.fontStyle, "italic");
  assert.equal(rendered.wordStyle.fontWeight, "500");
  assert.equal(rendered.wordStyle.color, "rgb(17, 17, 17)");
  if (design.id === "pieces" || design.id === "soft-power") {
    assert.ok(rendered.svgWidth > 0);
    if (viewport.width >= 768) assert.ok(rendered.svgWidth >= 300);
    assert.equal(rendered.pins, 4);
    assert.equal(rendered.count, "4 pieces tagged");
    assert.equal(rendered.labelsConnected, true);
    assert.equal(rendered.labelsInBounds, true, `${design.id} labels overflow viewport`);
    assert.equal(rendered.firstPinSize, "28px");
    assert.equal(rendered.firstPinColor, "rgb(17, 17, 17)");
    assert.equal(rendered.pinDuration, "0.26s");
    assert.equal(rendered.pinDelay, "0.3s");
    assert.equal(rendered.labelDelay, "0.38s");
    assert.equal(rendered.labelBackground, "rgba(17, 17, 17, 0.62)");
    if (viewport.width < viewport.height) {
      assert.ok(rendered.wordBox.top < rendered.artBox.top);
      assert.ok(rendered.artBox.bottom < rendered.countBox.top);
    } else {
      assert.ok(rendered.wordBox.left < rendered.artBox.left);
      assert.ok(rendered.countBox.left < rendered.artBox.left);
      assert.ok(rendered.countBox.top > rendered.wordBox.top);
    }
    if (design.id === "soft-power") {
      assert.equal(rendered.trousersFill, "rgb(212, 212, 212)");
      assert.equal(await splash.getByText("Satin blouse").count(), 1);
      assert.equal(rendered.svgViewBox, "-14 0 240 300");
    } else {
      assert.equal(rendered.svgViewBox, "24 12 172 258");
      assert.ok(rendered.artworkFills.includes("#D4D4D4"));
      assert.ok(rendered.artworkFills.includes("#E2E2E2"));
    }
    if (viewport.width >= 768 && viewport.width >= viewport.height) {
      assert.equal(rendered.desktopLayout, "grid");
      assert.ok(Number.parseFloat(rendered.wordStyle.fontSize) >= 64);
    }
    if (viewport.width === 1280 && design.id === "pieces") {
      assert.ok(
        Math.abs(rendered.artBox.width - 373) < 2,
        `pieces width was ${rendered.artBox.width}`,
      );
      assert.ok(
        Math.abs(rendered.artBox.height - 560) < 2,
        `pieces height was ${rendered.artBox.height}`,
      );
    }
  }
  if (viewport.width === 834 && viewport.height === 1194) {
    assert.equal(rendered.wordStyle.fontSize, "88px");
  }
  if (design.id === "wordmark") {
    assert.ok(Number.parseFloat(rendered.wordStyle.fontSize) >= 44);
    const line = await splash.locator(".boot-wordmark-line").evaluate((el) => ({
      width: getComputedStyle(el).width,
      height: getComputedStyle(el).height,
    }));
    assert.ok(Math.abs(Number.parseFloat(line.width) - Math.min(132, viewport.width * 0.3)) < 1);
    assert.equal(line.height, "1.5px");
  }
  if (design.id === "tag-draw") {
    assert.equal(rendered.kicker, "SHOP THE LOOK");
    assert.equal(rendered.svgViewBox, "0 0 64 40");
    assert.equal(rendered.svgWidth, 72);
    assert.equal(
      await splash.locator(".boot-art-tag path").getAttribute("d"),
      "M18 3H59a2 2 0 0 1 2 2v30a2 2 0 0 1-2 2H18L3 20Z",
    );
  }
  await splash.waitFor({ state: "detached", timeout: 5_000 });
}

async function checkColdStart(browser, design, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem(
      "looktag-splash-rotation-v1",
      JSON.stringify({
        selected: "pieces",
        last: "soft-power",
      }),
    );
  });
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
    const wordmark = frame?.querySelector(".boot-splash-word");
    const textRange = document.createRange();
    if (wordmark) textRange.selectNodeContents(wordmark);
    const wordmarkBox = textRange.getBoundingClientRect();
    return {
      root,
      background: getComputedStyle(el).backgroundColor,
      wordmarkVisible: Boolean(
        wordmark &&
        wordmarkBox.width > 0 &&
        wordmarkBox.height > 0 &&
        getComputedStyle(wordmark).visibility !== "hidden",
      ),
      wordmarkWidth: wordmarkBox.width,
      wordmarkOpacity: wordmark ? getComputedStyle(wordmark).opacity : "0",
      artVisible:
        root === "wordmark"
          ? wordmarkBox.width > 0
          : frame?.querySelector(".boot-splash-art")?.getBoundingClientRect().width > 0,
      artRight: frame?.querySelector(".boot-splash-art")?.getBoundingClientRect().right ?? 0,
      labelsInBounds: [...(frame?.querySelectorAll(".boot-piece-label") ?? [])].every((label) => {
        const bounds = label.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }),
      rotationKey: localStorage.getItem("looktag-splash-rotation-v1"),
      startupImages: [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map(
        (link) => ({ href: link.getAttribute("href"), media: link.getAttribute("media") }),
      ),
      wordmarkFirst:
        root === "pieces" || root === "soft-power"
          ? frame
              ?.querySelector(".boot-splash-side")
              ?.firstElementChild?.classList.contains("boot-splash-mark")
          : true,
    };
  });
  assert.equal(firstPaint.root, design.id);
  assert.equal(firstPaint.background, "rgb(244, 244, 244)");
  assert.equal(firstPaint.wordmarkVisible, true);
  assert.ok(firstPaint.wordmarkWidth > 0);
  if (design.id === "wordmark") assert.equal(firstPaint.wordmarkOpacity, "1");
  assert.equal(firstPaint.artVisible, true);
  assert.ok(firstPaint.artRight <= viewport.width);
  assert.equal(firstPaint.labelsInBounds, true);
  assert.equal(firstPaint.wordmarkFirst, true);
  assert.equal(firstPaint.rotationKey, null);
  assert.equal(firstPaint.startupImages.length, 14);
  assert.ok(
    firstPaint.startupImages.every(
      ({ href, media }) =>
        href.startsWith(`/splash/${design.id}-`) && media.includes("orientation: portrait"),
    ),
  );
  const imageSizes = await page.evaluate(
    async (links) =>
      Promise.all(
        links.map(async ({ href }) => {
          const response = await fetch(href);
          const bytes = new DataView(await response.arrayBuffer());
          return { href, ok: response.ok, width: bytes.getUint32(16), height: bytes.getUint32(20) };
        }),
      ),
    firstPaint.startupImages,
  );
  for (const image of imageSizes) {
    assert.equal(image.ok, true, `missing startup image ${image.href}`);
    assert.equal(image.href, `/splash/${design.id}-${image.width}x${image.height}.png`);
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
  await appPage.addInitScript(() => {
    localStorage.setItem(
      "looktag-splash-rotation-v1",
      JSON.stringify({
        selected: "pieces",
        last: "soft-power",
      }),
    );
  });
  const startedAt = Date.now();
  await appPage.goto(origin, { waitUntil: "domcontentloaded" });
  assert.equal(await appPage.locator("html").getAttribute("data-splash"), design.id);
  assert.equal(
    await appPage.evaluate(() => localStorage.getItem("looktag-splash-rotation-v1")),
    null,
  );
  assert.ok(
    (
      await appPage.locator('link[rel="apple-touch-startup-image"]').first().getAttribute("href")
    ).startsWith(`/splash/${design.id}-`),
  );
  const splash = appPage.locator(`.boot-splash[data-boot][data-splash="${design.id}"]`);
  await splash.waitFor({ timeout: 10_000 });
  await splash.waitFor({ state: "detached", timeout: 12_000 });
  assert.ok(Date.now() - startedAt >= 1_200, `${design.id} ended before its animation cycle`);
  await appPage.reload({ waitUntil: "domcontentloaded" });
  assert.equal(
    await appPage.locator(".boot-splash[data-boot]").count(),
    0,
    `${design.id} replayed`,
  );
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
      remainingAnimations: [
        ...el.querySelectorAll(".boot-splash-pin, .boot-piece-label, .boot-splash-count"),
      ].map((node) => getComputedStyle(node).animationName),
      wordAnimation: word ? getComputedStyle(word).animationName : "",
      wordTransform: word ? getComputedStyle(word).transform : "",
      lineTransform: el.querySelector(".boot-wordmark-line")
        ? getComputedStyle(el.querySelector(".boot-wordmark-line")).transform
        : "",
    };
  }, design.motion);
  assert.equal(motion.animation, "none", `${design.id} artwork animates with reduced motion`);
  if (design.id === "tag-draw") assert.equal(Number.parseFloat(motion.dashOffset), 0);
  assert.ok(motion.remainingAnimations.every((animation) => animation === "none"));
  assert.equal(motion.wordAnimation, "none");
  assert.equal(motion.wordTransform, "none");
  if (design.id === "wordmark") assert.equal(motion.lineTransform, "none");
  await splash.waitFor({ state: "detached", timeout: 5_000 });
}

async function checkRouteReadiness(browser, path) {
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  const startedAt = Date.now();
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  const splash = page.locator(".boot-splash[data-boot]");
  await splash.waitFor({ timeout: 5_000 });
  await splash.waitFor({ state: "detached", timeout: 6_000 });
  assert.ok(Date.now() - startedAt < 6_000, `${path} held the splash until its timeout`);
  assert.equal(await page.locator("html").getAttribute("data-route-ready"), "true");
  await context.close();
}

async function rejectUnknownSplash(page) {
  const body = JSON.stringify(toJSON({ data: { splashId: "neon" }, context: {} }));
  const status = await page.evaluate(
    async ({ fn, body }) => {
      const response = await fetch(`/_serverFn/${fn}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-tsr-serverfn": "true" },
        body,
      });
      return response.status;
    },
    { fn: settingsServerFn, body },
  );
  assert.equal(status, 400, "unknown splash id must be rejected");
}

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  await page.goto(`${origin}/login?next=${encodeURIComponent("/admin/studio")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 10_000 });
  await page
    .locator("#creator-email")
    .fill(credentials.email.toLowerCase() === "hello@thelooktag.com" ? "admin" : credentials.email);
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

  for (const path of ["/houses", "/create", "/you", "/login"]) {
    await checkRouteReadiness(browser, path);
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
  assert.equal(
    await page.locator(".boot-splash[data-boot]").count(),
    0,
    "splash replayed after reload",
  );
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
