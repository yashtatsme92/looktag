import assert from "node:assert/strict";
import { chromium } from "playwright";
import { BOOT_SKIP_KEY, resolveAdminCredentials, resolveOrigin } from "./helpers.mjs";

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

  for (const design of designs) {
    await selectSplash(page, design.label);
    for (const viewport of viewports) {
      await previewSplash(page, design, viewport);
    }
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const softPower = designs.find((design) => design.id === "soft-power");
  assert.ok(softPower);
  await page.setViewportSize(viewports[1]);
  await page.getByRole("button", { name: "Play" }).click();
  const reducedSplash = page.locator('.boot-splash[data-boot][data-splash="soft-power"]');
  await reducedSplash.waitFor({ timeout: 5_000 });
  const motion = await reducedSplash.locator(".boot-piece-lines path").first().evaluate((el) => ({
    animation: getComputedStyle(el).animationName,
    dashOffset: getComputedStyle(el).strokeDashoffset,
  }));
  assert.equal(motion.animation, "none");
  assert.equal(Number.parseFloat(motion.dashOffset), 0);
  await reducedSplash.waitFor({ state: "detached", timeout: 5_000 });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await selectSplash(page, "Tag draw");
  await page.setViewportSize(viewports[0]);
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator('.boot-splash[data-boot][data-splash="tag-draw"]').waitFor({ timeout: 5_000 });
  await page.locator('.boot-splash[data-boot][data-splash="tag-draw"]').waitFor({
    state: "detached",
    timeout: 5_000,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("html.boot-react").waitFor({ timeout: 10_000 });
  assert.equal(await page.locator(".boot-splash[data-boot]").count(), 0, "splash replayed after reload");
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), BOOT_SKIP_KEY), "done");
  await context.close();
} finally {
  await browser.close();
}

console.log("splash designs ok");
