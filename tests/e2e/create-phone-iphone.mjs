#!/usr/bin/env node
/**
 * Issue #244: exercise the real photo chooser and Create flow in iPhone-sized WebKit.
 * The keyboard is simulated: desktop Playwright WebKit cannot open the iOS keyboard.
 * Run with: node tests/e2e/create-phone-iphone.mjs [origin]
 */
import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import sharp from "sharp";
import { devices, webkit } from "playwright";
import {
  BOOT_SKIP_KEY,
  BROWSE_COACH_KEY,
  STYLE_GUIDE_KEY,
  clearUploadedDrafts,
  deleteUploadedLook,
  fillAdminLogin,
  resolveOrigin,
} from "./helpers.mjs";

const origin = resolveOrigin();
const width = 4000;
const height = 3000;
const pixels = randomFillSync(Buffer.alloc(width * height * 3));
const photo = await sharp(pixels, { raw: { width, height, channels: 3 } })
  .jpeg({ quality: 90 })
  .toBuffer();
const metadata = await sharp(photo).metadata();
assert.equal(metadata.width, width);
assert.equal(metadata.height, height);
assert.ok(
  photo.length > 5 * 1024 * 1024 && photo.length < 12 * 1024 * 1024,
  `fixture size ${photo.length}`,
);
console.log(`ok  iphone.fixture — ${metadata.width}x${metadata.height}, ${photo.length} bytes`);

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
  locale: "en-GB",
});
await context.addInitScript(
  ([guide, coach, boot]) => {
    localStorage.setItem(guide, "done");
    localStorage.setItem(coach, "done");
    sessionStorage.setItem(boot, "done");
    const vv = Object.assign(new EventTarget(), {
      width: innerWidth,
      height: innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  },
  [STYLE_GUIDE_KEY, BROWSE_COACH_KEY, BOOT_SKIP_KEY],
);
const page = await context.newPage();
page.setDefaultTimeout(15_000);
let publishedId = "";

async function step(name) {
  await page.waitForFunction(
    (value) => document.querySelector(".look-studio")?.getAttribute("data-step") === value,
    name,
    { timeout: 15_000 },
  );
}

async function keyboardField(selector, offsetTop) {
  const field = page.locator(selector);
  assert.equal(await field.getAttribute("autocomplete"), "off");
  assert.ok(await field.getAttribute("inputmode"));
  assert.ok(await field.getAttribute("enterkeyhint"));
  await page.evaluate((top) => {
    window.visualViewport.height = 508;
    window.visualViewport.offsetTop = top;
  }, offsetTop);
  await field.focus();
  await page.evaluate(() => window.visualViewport.dispatchEvent(new Event("resize")));
  async function assertVisible() {
    await page.waitForFunction(
      (sel) => {
        const field = document.querySelector(sel);
        const dock = field?.closest("[data-kb-root]")?.querySelector("[data-kb-dock]");
        if (!field || !dock || document.activeElement !== field) return false;
        const f = field.getBoundingClientRect();
        const d = dock.getBoundingClientRect();
        const vv = window.visualViewport;
        const hit = (x, y) => document.elementsFromPoint(x, y)[0] === field;
        return (
          Math.abs(d.bottom - (vv.offsetTop + vv.height)) <= 2 &&
          f.top >= vv.offsetTop &&
          f.bottom <= vv.offsetTop + vv.height - 119 &&
          f.bottom <= d.top - 15 &&
          hit(f.left + 12, f.top + 12) &&
          hit(f.right - 12, f.bottom - 12)
        );
      },
      selector,
      { timeout: 5_000 },
    );
  }
  await assertVisible();
  await page.evaluate(() => {
    window.visualViewport.height = 468;
    window.visualViewport.dispatchEvent(new Event("scroll"));
  });
  await assertVisible();
  if (selector === "#create-caption" && offsetTop === 0) {
    await page.waitForTimeout(80);
    await page.locator(".create-details").evaluate((scroller) => { scroller.scrollTop = 0; });
    await assertVisible();
  }
  console.log(`ok  iphone.keyboard ${selector} offset=${offsetTop}`);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.visualViewport.height = innerHeight;
    window.visualViewport.offsetTop = 0;
    window.visualViewport.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
  });
}

async function canvasState(selector, expectedCrop, pinCount) {
  await page.waitForFunction((sel) => {
    const canvas = document.querySelector(sel);
    const img = canvas?.querySelector("img");
    return img?.complete && img.naturalWidth > 0 && canvas.dataset.visibleCrop !== "null";
  }, selector);
  const state = await page.locator(selector).evaluate((canvas) => {
    const img = canvas.querySelector("img");
    const frame = canvas.getBoundingClientRect();
    const image = img.getBoundingClientRect();
    const pin = canvas.querySelector("[data-tag-pin]");
    const p = pin?.getBoundingClientRect();
    return {
      crop: JSON.parse(canvas.dataset.crop),
      visible: JSON.parse(canvas.dataset.visibleCrop),
      frame: { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
      image: { left: image.left, top: image.top, width: image.width, height: image.height },
      pins: canvas.querySelectorAll("[data-tag-pin]").length,
      pin: pin && {
        x: Number(pin.dataset.imageX),
        y: Number(pin.dataset.imageY),
        cx: p.left + p.width / 2,
        cy: p.top + p.height / 2,
      },
    };
  });
  assert.equal(state.pins, pinCount, `${selector} pin count`);
  for (const key of ["x", "y", "w", "h"]) {
    assert.ok(Math.abs(state.crop[key] - expectedCrop[key]) < 0.0001, `${selector} crop ${key}`);
  }
  const { frame, image, visible, pin } = state;
  for (const [actual, expected] of [
    [image.width, frame.width / visible.w],
    [image.height, frame.height / visible.h],
    [image.left, frame.left - visible.x * image.width],
    [image.top, frame.top - visible.y * image.height],
  ])
    assert.ok(
      Math.abs(actual - expected) < 2,
      `${selector} image geometry ${actual} != ${expected}`,
    );
  if (pin) {
    assert.ok(
      Math.abs(pin.cx - (frame.left + ((pin.x / 100 - visible.x) / visible.w) * frame.width)) < 2,
    );
    assert.ok(
      Math.abs(pin.cy - (frame.top + ((pin.y / 100 - visible.y) / visible.h) * frame.height)) < 2,
    );
  }
  console.log(`ok  iphone.crop ${selector} pins=${pinCount}`);
  return state;
}

try {
  const signedIn = Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim());
  if (signedIn) {
    await fillAdminLogin(page, origin);
    await page.getByTestId("admin-pages").waitFor({ timeout: 20_000 });
  }
  await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
  await page.locator(".look-studio[data-hydrated='true']").waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose photo" }).click(),
  ]);
  await chooser.setFiles({ name: "iphone-large.jpg", mimeType: "image/jpeg", buffer: photo });
  await step("crop");
  await page.locator(".crop-frame").waitFor({ timeout: 30_000 });
  const image = await page.locator(".crop-frame-image").evaluate((img) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
    srcLength: img.currentSrc.length,
    isDataUrl: img.currentSrc.startsWith("data:image/"),
  }));
  assert.ok(image.width > 0 && image.height > 0 && Math.max(image.width, image.height) <= 2048);
  assert.ok(Math.abs(image.width / image.height - width / height) < 0.01);
  assert.ok(image.isDataUrl && image.srcLength < 3 * 1024 * 1024, JSON.stringify(image));
  const initialCrop = JSON.parse(await page.locator(".crop-frame").getAttribute("data-crop"));
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  if (await zoomIn.isEnabled()) await zoomIn.click();
  await page.locator(".crop-frame").focus();
  await page.keyboard.press("ArrowRight");
  const crop = JSON.parse(await page.locator(".crop-frame").getAttribute("data-crop"));
  assert.notDeepEqual(crop, initialCrop, "crop adjustment did not apply");
  await page.getByRole("button", { name: "Use photo" }).click();
  await step("pins");
  await canvasState(".create-plate-canvas", crop, 0);

  await page.locator(".create-pin-actions").getByRole("button", { name: "Done" }).click();
  await step("details");
  await canvasState(".create-details-photo .create-plate-canvas", crop, 0);
  await page.getByRole("button", { name: "Back" }).click();
  await step("pins");
  await page.getByRole("button", { name: "Add pin" }).click();
  await step("piece");
  await page.getByRole("dialog", { name: "Edit piece" }).waitFor();
  for (const top of [0, 120]) {
    for (const selector of [
      ".create-piece-name",
      ".create-piece-retailer",
      '.create-piece-link[aria-label="Link"]',
    ]) {
      await keyboardField(selector, top);
    }
  }
  await page.locator(".create-piece-name").fill("Coat");
  await page.locator(".create-piece-retailer").fill("Zara");
  await page.locator(".create-piece").getByRole("button", { name: "Done" }).click();
  await step("pins");
  const pin = await canvasState(".create-plate-canvas", crop, 1);
  await page.locator(".create-pin-actions").getByRole("button", { name: "Done" }).click();
  await step("details");
  const details = await canvasState(".create-details-photo .create-plate-canvas", crop, 1);
  assert.deepEqual([details.pin.x, details.pin.y], [pin.pin.x, pin.pin.y]);
  for (const top of [0, 120]) {
    await keyboardField("#create-title", top);
    await keyboardField("#create-caption", top);
  }
  await page.locator("#create-title").fill("iPhone test look");
  await page.locator("#create-caption").fill("A large photo and one pin");
  await page.getByRole("button", { name: "Continue" }).click();
  await step("publish");
  const ready = await canvasState(".create-ready-photo .create-plate-canvas", crop, 1);
  assert.deepEqual([ready.pin.x, ready.pin.y], [pin.pin.x, pin.pin.y]);
  for (const key of ["x", "y", "w", "h"]) {
    assert.ok(
      Math.abs(details.visible[key] - ready.visible[key]) < 0.002,
      `details and ready visible crop ${key} differs: ${JSON.stringify({ details: details.visible, ready: ready.visible })}`,
    );
  }
  console.log("ok  iphone.crop details and ready visible crops agree");
  if (signedIn) {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.waitForURL(/\/looks\/[^/]+$/, { timeout: 60_000 });
    publishedId = new URL(page.url()).pathname.split("/").pop();
    assert.ok(publishedId && !publishedId.startsWith("seed-"));
    const result = await page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/looks/${encodeURIComponent(id)}`);
      return { status: response.status, body: await response.json() };
    }, publishedId);
    assert.equal(result.status, 200);
    assert.equal(result.body.title, "iPhone test look");
    assert.equal(result.body.tags.length, 1);
    assert.equal(result.body.tags[0].name, "Coat");
    for (const key of ["x", "y", "w", "h"]) {
      assert.ok(Math.abs(result.body.crop[key] - crop[key]) < 0.0001);
    }
    console.log("ok  iphone.publish — saved crop and pin verified");
  } else if (
    await page.getByText("Publishing and saving need an account", { exact: false }).isVisible()
  ) {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog", { name: "Sign in to publish" }).waitFor();
    console.log(
      "skip  iphone.publish — guest account gate; set ADMIN_BOOTSTRAP_PASSWORD to publish",
    );
  } else {
    console.log("skip  iphone.publish — no guest gate; avoiding persistent server data");
  }
} finally {
  try {
    if (publishedId) await deleteUploadedLook(page, publishedId);
    else await clearUploadedDrafts(page);
  } finally {
    await context.close();
    await browser.close();
  }
}
