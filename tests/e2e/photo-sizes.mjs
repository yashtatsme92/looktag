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
  create: { width: 900, height: 1200, channels: 3, background: { r: 180, g: 60, b: 40 } },
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
      await page.locator(".create-piece-name").fill("Round trip coat");
      await page.locator(".create-piece").getByRole("button", { name: "Done" }).click();
      await page.locator(".create-btn-done").click();
      await page.locator("#create-title").fill("Sized coat");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.waitForURL(/\/looks\//, { timeout: 30_000 });
      const id = new URL(page.url()).pathname.split("/").filter(Boolean).pop() ?? "";
      record("photo.id", Boolean(id) && !id.startsWith("seed-"), id);

      const detail = await page.evaluate(async (lookId) => {
        const res = await fetch(`/api/v1/looks/${lookId}`, { headers: { accept: "application/json" } });
        return { status: res.status, body: await res.json() };
      }, id);
      const images = detail.body?.images;
      record("photo.api.status", detail.status === 200, String(detail.status));
      record(
        "photo.api.images",
        Boolean(images?.thumb && images?.card && images?.detail && images?.jpeg?.thumb && images?.jpeg?.card && images?.jpeg?.detail && images?.original),
        JSON.stringify({ original: images?.original, width: images?.width, height: images?.height }),
      );
      record(
        "photo.api.original-3x4",
        Boolean(images?.original) && images.width > 0 && Math.abs(images.width / images.height / 0.75 - 1) <= 0.01,
        `${images?.width}x${images?.height}`,
      );
      record(
        "photo.api.no-data-url",
        typeof detail.body?.imageSrc === "string" && !String(detail.body.imageSrc).startsWith("data:"),
        String(detail.body?.imageSrc || "").slice(0, 80),
      );
      record("photo.api.hides-id", Boolean(images) && !JSON.stringify(images).includes(id));

      const urls = [images?.thumb, images?.card, images?.detail, images?.jpeg?.thumb, images?.jpeg?.card, images?.jpeg?.detail].filter(
        Boolean,
      );
      record("photo.urls", urls.length === 6, String(urls.length));
      const sized = {};
      for (const url of urls) {
        const absolute = new URL(url, origin).toString();
        const res = await page.request.get(absolute);
        const cache = res.headers()["cache-control"] || "";
        const type = res.headers()["content-type"] || "";
        const body = await res.body();
        const bytes = body.byteLength;
        const ok = res.status() === 200 && /immutable/.test(cache) && /image\/(webp|jpeg)/.test(type) && bytes > 32;
        record(`photo.fetch ${url.split("/").slice(-2).join("/")}`, ok, `${res.status()} ${type} ${bytes} ${cache}`);
        if (ok) sized[url] = await sharp(body).metadata();
      }
      const cardMeta = sized[images.card];
      const thumbMeta = sized[images.thumb];
      const detailMeta = sized[images.detail];
      record("photo.card.600x800", cardMeta?.width === 600 && cardMeta?.height === 800, `${cardMeta?.width}x${cardMeta?.height}`);
      record("photo.thumb.150x200", thumbMeta?.width === 150 && thumbMeta?.height === 200, `${thumbMeta?.width}x${thumbMeta?.height}`);
      record(
        "photo.detail.no-upscale",
        detailMeta?.width === 900 && detailMeta?.height === 1200,
        `${detailMeta?.width}x${detailMeta?.height}`,
      );
      const originalRes = await page.request.get(new URL(images.original, origin).toString());
      const originalMeta = await sharp(await originalRes.body()).metadata();
      record(
        "photo.original.kept",
        originalRes.status() === 200 && originalMeta.width === 900 && originalMeta.height === 1200,
        `${originalRes.status()} ${originalMeta.width}x${originalMeta.height}`,
      );

      await page.goto(`${origin}/looks/${id}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-tag-pin]").first().waitFor({ timeout: 12_000 });
      const reopened = await page.evaluate(() => {
        const frame = document.querySelector("[data-crop]");
        const pin = document.querySelector("[data-tag-pin]");
        if (!frame || !pin) return null;
        const box = frame.getBoundingClientRect();
        const rect = pin.getBoundingClientRect();
        const crop = JSON.parse(frame.dataset.crop);
        const u = Number(pin.dataset.imageX) / 100;
        const v = Number(pin.dataset.imageY) / 100;
        const expectedX = (u - crop.x) / crop.w;
        const expectedY = (v - crop.y) / crop.h;
        return {
          baked: frame.dataset.baked,
          name: pin.getAttribute("aria-label") || "",
          imageX: Number(pin.dataset.imageX),
          imageY: Number(pin.dataset.imageY),
          dx: rect.left + rect.width / 2 - (box.left + expectedX * box.width),
          dy: rect.top + rect.height / 2 - (box.top + expectedY * box.height),
          ratio: box.width / box.height,
        };
      });
      record(
        "photo.reopen.pin",
        Boolean(reopened) &&
          reopened.baked === "true" &&
          /Round trip coat/.test(reopened.name) &&
          Math.abs(reopened.imageX - 42) < 0.2 &&
          Math.abs(reopened.imageY - 36) < 0.2 &&
          Math.abs(reopened.dx) <= 2 &&
          Math.abs(reopened.dy) <= 2 &&
          Math.abs(reopened.ratio / 0.75 - 1) <= 0.01,
        JSON.stringify(reopened),
      );

      const list = await page.evaluate(async () => {
        const res = await fetch("/api/v1/looks");
        return { status: res.status, body: await res.json() };
      });
      const listed = Array.isArray(list.body) ? list.body.find((look) => look.id === id) : null;
      record("photo.list", list.status === 200 && listed?.images?.card === images?.card);

      await page.goto(origin, { waitUntil: "domcontentloaded" });
      const source = page.locator("picture source[type='image/webp']").first();
      await source.waitFor({ state: "attached", timeout: 15_000 });
      const srcset = await page.locator("picture source[type='image/webp']").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("srcset") || "").join("\n"),
      );
      const cardName = String(images?.card || "").split("/").pop() || "";
      record("photo.feed.srcset", Boolean(cardName) && srcset.includes(cardName) && /\s\d+w/.test(srcset), cardName);
      const sizes = await page.locator("picture source[type='image/webp']").first().getAttribute("sizes");
      record("photo.feed.sizes", Boolean(sizes && sizes.length > 0), sizes || "");
    },
    "photo-sizes",
    { viewport: { width: 1280, height: 800 } },
  );
} catch (error) {
  record("photo.flow", false, String(error?.message || error).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await rm(root, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
