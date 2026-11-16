#!/usr/bin/env node
/**
 * #219 — Publish a photo, then every size exists with an immutable cache
 * header and the feed asks for them with srcset.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = await mkdtemp(path.join(tmpdir(), "looktag-photo-e2e-"));
const photo = path.join(root, "look.jpg");
const jpeg = await sharp({
  create: { width: 900, height: 1350, channels: 3, background: { r: 180, g: 60, b: 40 } },
})
  .jpeg()
  .toBuffer();
await writeFile(photo, jpeg);

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
try {
  await withPage(
    browser,
    origin,
    async (page) => {
      page.setDefaultTimeout(30_000);
      await page.goto(`${origin}/login?next=%2Fcreate`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator("form[data-hydrated='true']").waitFor({ timeout: 30_000 });
      const signupTab = page.getByRole("button", { name: "Create account", pressed: false });
      if (await signupTab.count()) await signupTab.click();
      await page.locator("#creator-name").waitFor();
      await page.locator("#creator-name").fill("Photo Sizes");
      await page.locator("#creator-handle").fill(`photos${stamp.slice(-6)}`);
      await page.locator("#creator-city").fill("Berlin");
      await page.locator("#creator-email").fill(`e2e-photos-${stamp}@looktag.test`);
      await page.locator("#creator-password").fill("looktag-e2e-pass-1");
      await page.locator("form").getByRole("button", { name: "Create account" }).click();
      await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 20_000 });
      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
      await page.locator(".look-studio[data-hydrated='true']").waitFor();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Upload photo" }).click(),
      ]);
      await chooser.setFiles(photo);
      await page.locator(".create-crop-step").waitFor();
      await page.getByRole("button", { name: "Use photo" }).click();
      await page.getByRole("button", { name: "Add pin" }).click();
      await page.locator(".create-piece-name").fill("Round-trip coat");
      await page.locator(".create-piece").getByRole("button", { name: "Done" }).click();
      await page.locator(".create-pin-actions").getByRole("button", { name: "Done" }).click();
      await page.getByRole("heading", { name: "Details" }).waitFor();
      const cropStep = await page.locator(".create-details-photo .create-plate-canvas")
        .getAttribute("data-crop")
        .then((raw) => JSON.parse(raw || "null"));
      record(
        "photo.crop.centered-3:4",
        Boolean(cropStep && Math.abs(cropStep.x) < 0.002 && Math.abs(cropStep.y - 1 / 18) < 0.002 &&
          Math.abs(cropStep.w - 1) < 0.002 && Math.abs(cropStep.h - 8 / 9) < 0.002),
        JSON.stringify(cropStep),
      );
      await page.locator("#create-title").fill("Sized coat");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("heading", { name: "Ready" }).waitFor();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.waitForURL(/\/looks\//, { timeout: 30_000 });
      const id = new URL(page.url()).pathname.split("/").filter(Boolean).pop() ?? "";
      record("photo.id", Boolean(id) && !id.startsWith("seed-"), id);

      const detail = await page.evaluate(async (lookId) => {
        const res = await fetch(`/api/v1/looks/${lookId}`, { headers: { accept: "application/json" } });
        return { status: res.status, body: await res.json() };
      }, id);
      let images = detail.body?.images;
      record("photo.api.status", detail.status === 200, String(detail.status));
      record(
        "photo.api.images",
        Boolean(images?.thumb && images?.feed && images?.card && images?.detail && images?.jpeg?.thumb && images?.jpeg?.feed && images?.jpeg?.card && images?.jpeg?.detail),
      );
      record("photo.api.original", typeof images?.original === "string" && images.original.length > 0);
      record(
        "photo.round-trip.crop-and-pin",
        Math.abs(detail.body?.crop?.y - 1 / 18) < 0.002 &&
          Math.abs(detail.body?.crop?.h - 8 / 9) < 0.002 &&
          detail.body?.tags?.length === 1 &&
          detail.body.tags[0]?.name === "Round-trip coat",
      );
      await page.goto(`${origin}/looks/${id}/edit`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Edit look" }).waitFor();
      await page.getByRole("button", { name: "Edit crop" }).click();
      await page.locator(".crop-frame").waitFor();
      await page.waitForFunction(() => {
        const frame = document.querySelector(".crop-frame");
        return frame && frame.getBoundingClientRect().width > 100;
      });
      await page.waitForFunction(() => {
        const image = document.querySelector(".crop-image-loader");
        return image?.complete && image.naturalWidth > 0;
      });
      const cropBefore = await page.locator(".crop-frame").evaluate((frame) => {
        const box = frame.getBoundingClientRect();
        const image = document.querySelector(".crop-image-loader");
        return {
          crop: JSON.parse(frame.dataset.crop || "null"),
          ratio: box.width / box.height,
          width: box.width,
          height: box.height,
          source: image?.currentSrc,
          naturalWidth: image?.naturalWidth,
          naturalHeight: image?.naturalHeight,
          pinCount: frame.querySelectorAll(".crop-pin-marker").length,
        };
      });
      const originalPath = new URL(images.original, origin).pathname;
      record(
        "photo.edit-crop.original",
        cropBefore.crop &&
          Math.abs(cropBefore.ratio / 0.75 - 1) <= 0.01 &&
          cropBefore.width > 300 &&
          cropBefore.height > 400 &&
          cropBefore.naturalWidth === 900 &&
          cropBefore.naturalHeight === 1350 &&
          new URL(cropBefore.source, origin).pathname === originalPath &&
          cropBefore.pinCount === 1,
        JSON.stringify(cropBefore),
      );
      const frame = await page.locator(".crop-frame").boundingBox();
      await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
      await page.mouse.down();
      await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2 + 24, { steps: 4 });
      await page.mouse.up();
      await page.getByRole("button", { name: "Save crop" }).click();
      await page.getByRole("heading", { name: "Edit look" }).waitFor();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForURL(new RegExp(`/looks/${id}$`), { timeout: 30_000 });
      const recropped = await page.evaluate(async (lookId) => {
        const response = await fetch(`/api/v1/looks/${lookId}`);
        return { status: response.status, body: await response.json() };
      }, id);
      const updatedCrop = recropped.body?.crop;
      images = recropped.body?.images;
      record(
        "photo.edit-crop.saved",
        recropped.status === 200 &&
          updatedCrop &&
          Math.abs(updatedCrop.y - detail.body.crop.y) > 0.005 &&
          recropped.body.tags?.length === 1 &&
          recropped.body.tags[0]?.name === "Round-trip coat" &&
          recropped.body.tags[0]?.x === detail.body.tags[0]?.x &&
          recropped.body.tags[0]?.y === detail.body.tags[0]?.y &&
          Boolean(images?.original),
        JSON.stringify({ crop: updatedCrop, tags: recropped.body?.tags }),
      );
      await page.goto(`${origin}/looks/${id}/edit`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Edit look" }).waitFor();
      await page.getByRole("button", { name: "Edit crop" }).click();
      await page.locator(".crop-frame").waitFor();
      await page.waitForFunction(
        () => {
          const frame = document.querySelector(".crop-frame");
          return frame && frame.getBoundingClientRect().width > 100;
        },
        null,
        { timeout: 5_000 },
      );
      const reopenedCrop = await page.locator(".crop-frame").evaluate((frame) => ({
        crop: JSON.parse(frame.dataset.crop || "null"),
        pinCount: frame.querySelectorAll(".crop-pin-marker").length,
        source: document.querySelector(".crop-image-loader")?.currentSrc,
      }));
      record(
        "photo.edit-crop.reopened",
        reopenedCrop.crop &&
          Math.abs(reopenedCrop.crop.y - updatedCrop.y) < 0.001 &&
          reopenedCrop.pinCount === 1 &&
          new URL(reopenedCrop.source, origin).pathname === new URL(images.original, origin).pathname,
        JSON.stringify(reopenedCrop),
      );
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${origin}/looks/${id}`, { waitUntil: "domcontentloaded" });
      record(
        "photo.api.no-data-url",
        typeof detail.body?.imageSrc === "string" && !String(detail.body.imageSrc).startsWith("data:"),
        String(detail.body?.imageSrc || "").slice(0, 80),
      );
      record("photo.api.hides-id", Boolean(images) && !JSON.stringify(images).includes(id));

      const urls = [images?.thumb, images?.feed, images?.card, images?.detail, images?.jpeg?.thumb, images?.jpeg?.feed, images?.jpeg?.card, images?.jpeg?.detail].filter(
        Boolean,
      );
      record("photo.urls", urls.length === 8, String(urls.length));
      for (const url of urls) {
        const absolute = new URL(url, origin).toString();
        const res = await page.request.get(absolute);
        const cache = res.headers()["cache-control"] || "";
        const type = res.headers()["content-type"] || "";
        const bytes = (await res.body()).byteLength;
        const ok = res.status() === 200 && /immutable/.test(cache) && /image\/(webp|jpeg)/.test(type) && bytes > 32;
        record(`photo.fetch ${url.split("/").slice(-2).join("/")}`, ok, `${res.status()} ${type} ${bytes} ${cache}`);
      }

      const list = await page.evaluate(async () => {
        const res = await fetch("/api/v1/looks");
        return { status: res.status, body: await res.json() };
      });
      const listed = Array.isArray(list.body) ? list.body.find((look) => look.id === id) : null;
      record("photo.list", list.status === 200 && listed?.images?.card === images?.card);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".wide-plate-canvas[data-baked='true']").waitFor({ timeout: 15_000 });
      const pinMapping = await page.locator(".wide-plate-canvas").evaluate((frame) => {
        const pin = frame.querySelector("[data-tag-pin]");
        const crop = JSON.parse(frame.dataset.crop || "null");
        if (!pin || !crop) return null;
        const frameBox = frame.getBoundingClientRect();
        const pinBox = pin.getBoundingClientRect();
        const u = Number(pin.dataset.imageX) / 100;
        const v = Number(pin.dataset.imageY) / 100;
        return {
          ratio: frameBox.width / frameBox.height,
          dx: pinBox.left + pinBox.width / 2 - (frameBox.left + ((u - crop.x) / crop.w) * frameBox.width),
          dy: pinBox.top + pinBox.height / 2 - (frameBox.top + ((v - crop.y) / crop.h) * frameBox.height),
        };
      });
      record(
        "photo.round-trip.reopened-baked-pin",
        Boolean(pinMapping && Math.abs(pinMapping.ratio / 0.75 - 1) <= 0.01 &&
          Math.abs(pinMapping.dx) <= 2 && Math.abs(pinMapping.dy) <= 2),
        JSON.stringify(pinMapping),
      );
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      const source = page.locator("picture source[type='image/webp']").first();
      await source.waitFor({ state: "attached", timeout: 15_000 });
      const srcset = await page.locator("picture source[type='image/webp']").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("srcset") || "").join("\n"),
      );
      const cardName = String(images?.card || "").split("/").pop() || "";
      record("photo.feed.srcset", Boolean(cardName) && srcset.includes(cardName) && /\s\d+w/.test(srcset), cardName);
      record("photo.feed.right-sized", /feed\.webp\s+450w/.test(srcset), srcset);
      const sizes = await page.locator("picture source[type='image/webp']").first().getAttribute("sizes");
      record("photo.feed.sizes", Boolean(sizes && sizes.length > 0), sizes || "");
    },
    "photo-sizes",
    { viewport: { width: 390, height: 844 } },
  );
} catch (error) {
  record("photo.flow", false, String(error?.message || error).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await rm(root, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
