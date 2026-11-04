#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SPLASH_DESIGNS = ["wordmark", "tag-draw", "pieces", "soft-power"];
const selectedDesign = SPLASH_DESIGNS.includes(process.env.LOOKTAG_SPLASH_DESIGN)
  ? process.env.LOOKTAG_SPLASH_DESIGN
  : "tag-draw";

const art = {
  wordmark: '<div class="rule"></div>',
  "tag-draw": `<svg class="tag" viewBox="0 0 160 110" fill="none">
    <path d="M37 18 H98 L129 48 V92 H37 Z" stroke="#898989" stroke-width="1.5" />
    <circle cx="105" cy="42" r="5" stroke="#898989" stroke-width="1.5" />
    <path d="M108 38 C135 17 141 41 125 51" stroke="#898989" stroke-width="1.5" />
  </svg>`,
  pieces: `<svg class="pieces" viewBox="0 0 400 360" fill="none">
    <g stroke="#969696" stroke-width="1.4" stroke-linejoin="round">
      <path d="M51 40 L79 27 L100 43 L121 27 L149 40 L169 66 L151 77 L137 60 V106 H63 V60 L49 77 L31 66 Z" />
      <path d="M252 48 H348 V107 H252 Z M268 48 C268 20 294 20 294 48 M306 48 C306 20 332 20 332 48" />
      <path d="M48 194 H152 L147 220 L135 267 L105 260 L100 224 L95 260 L65 267 L53 220 Z" />
      <path d="M235 222 Q248 206 270 206 H302 Q315 206 327 218 L354 228 Q362 232 357 240 H251 Q238 238 235 222 Z" />
      <path d="M235 258 Q248 242 270 242 H302 Q315 242 327 254 L354 264 Q362 268 357 276 H251 Q238 274 235 258 Z" />
    </g>
    <g fill="#292929" font-family="Arial,sans-serif" font-size="10" text-anchor="middle">
      <rect x="18" y="121" width="164" height="22" rx="11" /><text x="100" y="136" fill="white">Linen shirt</text>
      <rect x="218" y="121" width="164" height="22" rx="11" /><text x="300" y="136" fill="white">Raffia tote</text>
      <rect x="18" y="321" width="164" height="22" rx="11" /><text x="100" y="336" fill="white">Pleated shorts</text>
      <rect x="218" y="321" width="164" height="22" rx="11" /><text x="300" y="336" fill="white">Espadrilles</text>
    </g>
  </svg>`,
  "soft-power": `<svg class="pieces" viewBox="0 0 400 360" fill="none">
    <g stroke="#969696" stroke-width="1.4" stroke-linejoin="round">
      <path d="M51 40 L79 27 L100 43 L121 27 L149 40 L169 66 L151 77 L137 60 V106 H63 V60 L49 77 L31 66 Z" />
      <path d="M247 30 H353 L347 59 L337 107 H307 L300 60 L293 107 H263 L253 59 Z" />
      <path d="M46 205 Q46 194 59 194 H141 Q154 194 154 205 V258 H46 Z" />
      <path d="M240 222 Q250 212 264 211 L280 196 Q287 191 291 199 L289 211 Q307 203 323 208 Q331 211 326 218 L309 232 H252 Z" />
      <path d="M240 258 Q250 248 264 247 L280 232 Q287 227 291 235 L289 247 Q307 239 323 244 Q331 247 326 254 L309 268 H252 Z" />
    </g>
    <g fill="#292929" font-family="Arial,sans-serif" font-size="10" text-anchor="middle">
      <rect x="18" y="121" width="164" height="22" rx="11" /><text x="100" y="136" fill="white">Bow blouse</text>
      <rect x="218" y="121" width="164" height="22" rx="11" /><text x="300" y="136" fill="white">Wide-leg trousers</text>
      <rect x="18" y="281" width="164" height="22" rx="11" /><text x="100" y="296" fill="white">Clutch</text>
      <rect x="218" y="281" width="164" height="22" rx="11" /><text x="300" y="296" fill="white">Kitten heels</text>
    </g>
  </svg>`,
};

const word = `<p class="word">Looktag</p>`;
const label = selectedDesign === "pieces" || selectedDesign === "soft-power"
  ? '<p class="count">4 pieces tagged</p>'
  : "";
const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500;1,600&family=Figtree:wght@500&display=swap" />
  <style>
    html, body { margin: 0; height: 100%; background: #F4F4F4; color: #242424; }
    .wrap {
      width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #F4F4F4;
    }
    .word {
      margin: 0;
      font-family: "Playfair Display", "Times New Roman", serif;
      font-style: italic; font-size: 92px; font-weight: 500;
      letter-spacing: -0.03em; line-height: 0.86;
    }
    .art { display: flex; flex-direction: column; align-items: center; margin-bottom: 30px; }
    .tag { width: 190px; }
    .pieces { width: min(80vw, 820px); }
    .rule { width: 130px; height: 1px; margin-bottom: 28px; background: #898989; }
    .count { margin: 28px 0 0; border-radius: 999px; background: #292929; color: white; padding: 10px 24px; font: 500 20px Figtree, sans-serif; }
    .wordmark .art { margin-bottom: 34px; }
    .wordmark .word { margin-bottom: 20px; }
    .wordmark .rule { margin-bottom: 0; }
    .tag-draw .word { margin-top: 0; }
    .pieces-design .word, .soft-power .word { margin-top: 32px; font-size: 64px; }
  </style>
</head>
<body>
  <div class="wrap ${selectedDesign === "wordmark" ? "wordmark" : selectedDesign === "tag-draw" ? "tag-draw" : selectedDesign === "pieces" ? "pieces-design" : "soft-power"}">
    ${selectedDesign === "wordmark" ? `${word}<div class="rule"></div>` : `<div class="art">${art[selectedDesign]}${label}</div>${word}`}
  </div>
</body>
</html>`;

const sizes = [
  { w: 1170, h: 2532, name: "splash-1170x2532.png" },
  { w: 1179, h: 2556, name: "splash-1179x2556.png" },
  { w: 1290, h: 2796, name: "splash-1290x2796.png" },
  { w: 1284, h: 2778, name: "splash-1284x2778.png" },
  { w: 1206, h: 2622, name: "splash-1206x2622.png" },
  { w: 1320, h: 2868, name: "splash-1320x2868.png" },
  { w: 750, h: 1334, name: "splash-750x1334.png" },
  { w: 1125, h: 2436, name: "splash-1125x2436.png" },
  { w: 1668, h: 2388, name: "splash-1668x2388.png" },
  { w: 1640, h: 2360, name: "splash-1640x2360.png" },
  { w: 2048, h: 2732, name: "splash-2048x2732.png" },
];

const outDir = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const buf = await page.screenshot({ type: "png" });
  writeFileSync(`${outDir}${size.name}`, buf);
  await page.close();
}

await browser.close();
console.log(`splash images written to public/ for ${selectedDesign}`);
