#!/usr/bin/env node
import { chromium } from "playwright";
import { resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const viewports = [
  { width: 390, height: 844 },
  { width: 834, height: 1194 },
  { width: 1280, height: 800 },
];
const looks = ["seed-sofia-sun-bleached-linen"];
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Measure every visible photo on the page: ratio vs natural, object-fit, container gaps, pins. */
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  return [...document.querySelectorAll(".look-photo-img")].filter(visible).map((img) => {
    const r = img.getBoundingClientRect();
    const frame = img.parentElement.getBoundingClientRect();
    const pins = [...img.parentElement.querySelectorAll("[data-tag-pin]")].map((pin) => {
      const b = pin.getBoundingClientRect();
      return {
        cx: b.left + b.width / 2,
        cy: b.top + b.height / 2,
        ix: Number(pin.dataset.imageX),
        iy: Number(pin.dataset.imageY),
      };
    });
    return {
      loaded: img.complete && img.naturalWidth > 0,
      cropped: Boolean(img.style.width),
      w: r.width,
      h: r.height,
      left: r.left,
      top: r.top,
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      fit: getComputedStyle(img).objectFit,
      frame: { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom },
      navTop: (() => {
        const nav = document.querySelector("nav.tab-bar");
        const nr = nav?.getBoundingClientRect();
        return nr && nr.height > 0 ? nr.top : null;
      })(),
      pins,
    };
  });
}

const browser = await chromium.launch();
for (const viewport of viewports) {
  for (const slug of looks) {
    await withPage(
      browser,
      origin,
      async (page) => {
        await page.goto(`${origin}/looks/${slug}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll(".look-photo-img")].some(
              (img) => img.getBoundingClientRect().width > 0 && img.complete && img.naturalWidth > 0 && img.style.width,
            ),
          null,
          { timeout: 15_000 },
        );
        await page.waitForTimeout(300);
        const photos = await page.evaluate(measure);
        const label = `look-detail.${slug}@${viewport.width}`;
        record(`${label}.photo-found`, photos.length > 0);
        photos.forEach((m, i) => {
          const tag = `${label}.${i}`;
          const ratio = m.w / m.h;
          const natural = m.nw / m.nh;
          record(`${tag}.native-ratio`, Math.abs(ratio / natural - 1) <= 0.01, `${ratio.toFixed(3)} vs ${natural.toFixed(3)}`);
          record(`${tag}.not-fill`, m.fit !== "fill", m.fit);
          record(
            `${tag}.no-gap`,
            m.left <= m.frame.left + 1 && m.left + m.w >= m.frame.right - 1 && m.top <= m.frame.top + 1 && m.top + m.h >= m.frame.bottom - 1,
            JSON.stringify(m.frame),
          );
          m.pins.forEach((p, j) => {
            const mx = ((p.cx - m.left) / m.w) * 100;
            const my = ((p.cy - m.top) / m.h) * 100;
            const dx = Math.max(Math.abs(mx - p.ix) / 100 * m.w, 0);
            const dy = Math.abs(my - p.iy) / 100 * m.h;
            record(`${tag}.pin-${j}-position`, dx <= 4 && dy <= 4, `drift ${dx.toFixed(1)}x${dy.toFixed(1)}px`);
            const inside = p.cx >= m.frame.left && p.cx <= m.frame.right && p.cy >= m.frame.top && p.cy <= m.frame.bottom;
            record(`${tag}.pin-${j}-in-frame`, inside);
            if (m.navTop !== null) record(`${tag}.pin-${j}-above-tab-bar`, p.cy <= m.navTop, `y=${p.cy.toFixed(0)} nav=${m.navTop.toFixed(0)}`);
          });
        });
      },
      `aspect-${viewport.width}`,
      { viewport },
    );
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
