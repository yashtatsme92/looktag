#!/usr/bin/env node
/**
 * Phone LookCanvas (390): a failed photo shows the shared placeholder inside the
 * existing frame. Look detail stays 3:4. Create and the editor keep their frames.
 */
import { chromium } from "playwright";
import { CREATE_DRAFT_KEY } from "../../src/lib/looks/create-draft.ts";
import { clearUploadedDrafts, deleteUploadedLook, fillAdminLogin, resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const viewport = { width: 390, height: 844 };
const PLACEHOLDER = "Photo couldn't load. Try refreshing the page.";
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

const DRAFT = {
  id: "broken-photo-draft",
  userId: "",
  title: "Sunday coat",
  caption: "",
  creator: "You",
  imageSrc: "/looks/sunday-coat.jpg",
  createdAt: 1,
  updatedAt: 1,
  tags: [
    {
      id: "pin-1",
      x: 48,
      y: 40,
      name: "Coat",
      brand: "Zara",
      price: "",
      currency: "EUR",
      url: "",
      retailerId: "zara",
      offers: [],
    },
  ],
};

async function failImages(page) {
  await page.route("**/*", (route) => {
    if (route.request().resourceType() === "image") {
      return route.fulfill({ status: 404, contentType: "image/jpeg", body: "" });
    }
    return route.continue();
  });
}

async function frameOf(page, selector) {
  const msg = page.locator(`${selector} .img-slot-fallback`);
  await msg.waitFor({ state: "visible", timeout: 20_000 });
  return page.evaluate((sel) => {
    const frame = document.querySelector(sel);
    const text = frame?.querySelector(".img-slot-fallback");
    if (!frame || !text) return null;
    const f = frame.getBoundingClientRect();
    const m = text.getBoundingClientRect();
    return {
      text: (text.textContent || "").trim(),
      state: frame.getAttribute("data-photo-state"),
      ratio: f.height ? f.width / f.height : 0,
      inside:
        m.width > 8 &&
        m.height > 8 &&
        m.top >= f.top - 1 &&
        m.bottom <= f.bottom + 1 &&
        m.left >= f.left - 1 &&
        m.right <= f.right + 1,
      fw: Math.round(f.width),
      fh: Math.round(f.height),
    };
  }, selector);
}

const browser = await chromium.launch();
try {
  await withPage(
    browser,
    origin,
    async (page) => {
      await failImages(page);
      await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded" });
      const box = await frameOf(page, ".look-plate-canvas");
      const ratioOk = Boolean(box && Math.abs(box.ratio - 0.75) < 0.02);
      record(
        "broken-photo.look-detail.placeholder",
        Boolean(box && box.inside && box.state === "broken" && box.text === PLACEHOLDER && ratioOk),
        JSON.stringify(box),
      );
      await page.screenshot({ path: "/workspace/screenshots/broken-canvas-390.png" }).catch(() => {});
    },
    "broken-photo-look",
    { viewport },
  );

  await withPage(
    browser,
    origin,
    async (page) => {
      await page.addInitScript(
        ([key, raw]) => sessionStorage.setItem(key, raw),
        [CREATE_DRAFT_KEY, JSON.stringify(DRAFT)],
      );
      await failImages(page);
      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
      await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 12_000 });
      const step = await page.locator(".look-studio").getAttribute("data-step");
      record("broken-photo.create.preview-step", step === "pins" || step === "details" || step === "publish", step || "");
      const box = await frameOf(page, ".create-plate-canvas");
      record(
        "broken-photo.create.placeholder",
        Boolean(box && box.inside && box.state === "broken" && box.text === PLACEHOLDER && box.fw > 100 && box.fh > 100),
        JSON.stringify(box),
      );
    },
    "broken-photo-create",
    { viewport },
  );

  await withPage(
    browser,
    origin,
    async (page) => {
      let publishedId = "";
      try {
        await fillAdminLogin(page, origin);
        await page.evaluate(
          ([key, raw]) => sessionStorage.setItem(key, raw),
          [CREATE_DRAFT_KEY, JSON.stringify({ ...DRAFT, id: `broken-edit-${Date.now()}` })],
        );
        await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
        await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 12_000 });
        const step = await page.locator(".look-studio").getAttribute("data-step");
        if (step === "pins" || step === "piece") {
          await page.getByRole("button", { name: "Done" }).first().click();
        }
        if (await page.locator("#create-title").count()) {
          await page.getByRole("button", { name: "Continue" }).click();
        }
        await page.getByRole("button", { name: /^Publish/ }).click();
        await page.waitForURL(/\/looks\/(?!seed-)/, { timeout: 15_000 });
        publishedId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1) ?? "";
        await failImages(page);
        await page.goto(`${origin}/looks/${publishedId}/edit`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Edit look" }).waitFor({ timeout: 12_000 });
        const box = await frameOf(page, ".create-plate-canvas");
        record(
          "broken-photo.editor.placeholder",
          Boolean(box && box.inside && box.state === "broken" && box.text === PLACEHOLDER && box.fw > 100 && box.fh > 100),
          JSON.stringify(box),
        );
      } finally {
        await deleteUploadedLook(page, publishedId).catch(() => undefined);
        await clearUploadedDrafts(page);
      }
    },
    "broken-photo-editor",
    { viewport },
  );
} finally {
  await browser.close();
}

if (failed) process.exit(1);
console.log("BROKEN_PHOTO:0");
