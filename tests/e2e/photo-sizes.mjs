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
        Boolean(images?.thumb && images?.card && images?.detail && images?.jpeg?.thumb && images?.jpeg?.card && images?.jpeg?.detail),
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
