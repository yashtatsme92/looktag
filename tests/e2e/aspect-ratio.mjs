#!/usr/bin/env node
import { chromium } from "playwright";
import { resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const viewports = [
  { width: 390, height: 844 },
  { width: 834, height: 1194 },
  { width: 1280, height: 800 },
];
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
for (const viewport of viewports) {
  await withPage(
    browser,
    origin,
    async (page) => {
      await page.goto(`${origin}/looks/seed-sofia-sun-bleached-linen`, { waitUntil: "domcontentloaded" });
      const img = page.locator(".look-photo-img").first();
      await img.waitFor({ timeout: 10_000 });
      await page.waitForFunction(() => document.querySelector(".look-photo-img")?.complete);
      const m = await img.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const frame = el.parentElement.getBoundingClientRect();
        const pins = [...el.parentElement.querySelectorAll("[data-tag-pin]")].map((p) => {
          const b = p.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        });
        return {
          w: r.width, h: r.height, nw: el.naturalWidth, nh: el.naturalHeight,
          fit: getComputedStyle(el).objectFit,
          left: r.left, right: r.right,
          frame: { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom },
          pins,
        };
      });
      const label = `look-detail@${viewport.width}`;
      const ratio = m.w / m.h;
      const natural = m.nw / m.nh;
      const cropped = m.frame.right - m.frame.left;
      record(`${label}.native-ratio`, Math.abs(ratio / natural - 1) <= 0.01, `${ratio.toFixed(3)} vs ${natural.toFixed(3)}`);
      record(`${label}.not-fill`, m.fit !== "fill", m.fit);
      record(`${label}.no-gap`, m.left <= m.frame.left + 1 && m.right >= m.frame.right - 1, `img ${m.left}..${m.right}, frame ${m.frame.left}..${m.frame.right} (${cropped})`);
      record(
        `${label}.pins-in-frame`,
        m.pins.every((p) => p.x >= m.frame.left && p.x <= m.frame.right && p.y >= m.frame.top && p.y <= m.frame.bottom),
      );
    },
    `aspect-${viewport.width}`,
    { viewport },
  );
}
await browser.close();
process.exit(failed ? 1 : 0);
