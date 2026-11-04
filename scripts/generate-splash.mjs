#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SPLASH_DESIGNS = ["wordmark", "tag-draw", "pieces", "soft-power"];
const selectedDesign = SPLASH_DESIGNS.includes(process.env.LOOKTAG_SPLASH_DESIGN)
  ? process.env.LOOKTAG_SPLASH_DESIGN
  : "tag-draw";
const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = `${root}public/`;
const fontData = (name) => readFileSync(`${outDir}fonts/${name}`).toString("base64");
const playfair = fontData("playfair-display-latin-500-italic.woff2");
const figtree = fontData("figtree-latin-500-normal.woff2");

const pieces = (elegant) => {
  const top = elegant
    ? `<path class="fill" d="M51 40 L79 27 L100 43 L121 27 L149 40 L169 66 L151 77 L137 60 V106 H63 V60 L49 77 L31 66 Z"/>
       <path class="fill trousers" d="M247 30 H353 L347 59 L337 107 H307 L300 60 L293 107 H263 L253 59 Z"/>
       <path class="fill" d="M46 205 Q46 194 59 194 H141 Q154 194 154 205 V258 H46 Z"/>
       <path class="fill" d="M240 222 Q250 212 264 211 L280 196 Q287 191 291 199 L289 211 Q307 203 323 208 Q331 211 326 218 L309 232 H252 Z M240 258 Q250 248 264 247 L280 232 Q287 227 291 235 L289 247 Q307 239 323 244 Q331 247 326 254 L309 268 H252 Z"/>`
    : `<path class="fill shirt" d="M51 40 L79 27 L94 32 L100 43 L106 32 L121 27 L149 40 L169 66 L151 77 L137 60 V106 H63 V60 L49 77 L31 66 Z"/>
       <path class="fill tote" d="M252 48 H348 V107 H252 Z"/>
       <path class="fill shorts" d="M48 194 H152 L147 220 L135 267 L105 260 L100 224 L95 260 L65 267 L53 220 Z"/>
       <path class="fill" d="M235 222 Q248 206 270 206 H302 Q315 206 327 218 L354 228 Q362 232 357 240 H251 Q238 238 235 222 Z M235 258 Q248 242 270 242 H302 Q315 242 327 254 L354 264 Q362 268 357 276 H251 Q238 274 235 258 Z"/>`;
  const details = elegant
    ? `<path d="M100 43 V105 M65 91 H135 M79 29 L87 53 L100 43 L113 53 L121 29 M91 39 C78 29 82 20 94 27 L100 34 L106 27 C118 20 122 29 109 39 L100 46 Z"/>
       <path d="M250 41 H350 M280 33 L281 105 M320 33 L319 105 M300 32 V59"/>
       <path d="M58 194 V207 H142 V194 M64 222 H136 M64 237 H136"/>
       <path d="M280 199 L294 207 M252 222 H326 M280 235 L294 243 M252 258 H326"/>`
    : `<path d="M100 43 V105 M65 91 H135 M79 29 L87 53 M121 29 L113 53"/>
       <path d="M268 48 C268 20 294 20 294 48 M306 48 C306 20 332 20 332 48 M260 62 H340 M260 76 H340 M260 90 H340 M274 52 V104 M294 52 V104 M314 52 V104 M334 52 V104"/>
       <path d="M51 207 H149 M100 195 V222 M68 208 L75 257 M84 208 L87 257 M116 208 L113 257 M132 208 L125 257"/>
       <path d="M243 223 H351 M264 210 L276 227 M285 210 L296 227 M306 212 L317 229 M243 259 H351 M264 246 L276 263 M285 246 L296 263 M306 248 L317 265"/>`;
  const labels = elegant
    ? ["Satin blouse", "Wide-leg trousers", "Clutch", "Kitten heels"]
    : ["Linen shirt", "Raffia tote", "Pleated shorts", "Espadrilles"];
  const positions = [[159, 42, 18, 121], [359, 43, 218, 121], [159, 201, 18, 281], [359, 202, 218, 281]];
  return `<svg class="pieces" viewBox="0 0 400 360" fill="none">
    ${top}
    <g class="lines">${details}</g>
    <g class="pins">${positions.map(([cx, cy, x, y], i) => `
      <g class="pin">
        <circle class="number ${i === 0 ? "first" : ""}" cx="${cx}" cy="${cy}" r="14"/>
        <text class="number-text ${i === 0 ? "first" : ""}" x="${cx}" y="${cy + 0.5}">${i + 1}</text>
        <rect class="label" x="${x}" y="${y}" width="164" height="22" rx="11"/>
        <text class="label-text" x="${x + 82}" y="${y + 14.5}">${labels[i]}</text>
      </g>`).join("")}
    </g>
  </svg>`;
};

const art = {
  wordmark: '<div class="rule"></div>',
  "tag-draw": `<svg class="tag" viewBox="0 0 160 110" fill="none">
    <path d="M31 18 H99 L132 50 V96 H31 Z" />
    <circle cx="104" cy="42" r="7" />
    <circle class="eyelet" cx="104" cy="42" r="2" />
    <path d="M108 38 C135 17 141 41 125 51" />
  </svg>`,
  pieces: pieces(false),
  "soft-power": pieces(true),
};
const word = '<p class="word">Looktag</p>';
const className = selectedDesign === "wordmark"
  ? "wordmark"
  : selectedDesign === "tag-draw"
    ? "tag-draw"
    : selectedDesign === "pieces"
      ? "pieces-design"
      : "soft-power";
const content = selectedDesign === "wordmark"
  ? `${word}${art.wordmark}`
  : selectedDesign === "tag-draw"
    ? `<div class="art">${art[selectedDesign]}</div>${word}<p class="kicker">SHOP THE LOOK</p>`
    : `${word}<div class="art">${art[selectedDesign]}</div><p class="count">4 pieces tagged</p>`;

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @font-face { font-family: Playfair; src: url(data:font/woff2;base64,${playfair}) format("woff2"); font-style: italic; font-weight: 500; font-display: block; }
    @font-face { font-family: Figtree; src: url(data:font/woff2;base64,${figtree}) format("woff2"); font-style: normal; font-weight: 500; font-display: block; }
    html, body { margin: 0; width: 100%; height: 100%; background: #F4F4F4; color: #111; }
    .wrap { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5vh 3vw; background: #F4F4F4; }
    .word { margin: 0; color: #111; font-family: Playfair, serif; font-style: italic; font-size: clamp(72px, 13vw, 176px); font-weight: 500; letter-spacing: -0.03em; line-height: 0.9; }
    .art { display: flex; flex-direction: column; align-items: center; }
    .tag { width: min(58vw, 620px); }
    .tag path, .tag circle { fill: none; stroke: #111; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .tag circle:first-of-type { fill: #F4F4F4; }
    .pieces { display: block; width: min(94vw, 1240px); height: auto; overflow: visible; }
    .fill { fill: #fff; }
    .shirt { fill: #f8f6f1; }
    .tote { fill: #d8cbb7; }
    .shorts { fill: #e4e0d9; }
    .trousers { fill: #d4d4d4; }
    .lines { fill: none; stroke: #111; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
    .number { fill: #fff; }
    .number.first { fill: #111; }
    .number-text { fill: #111; font: 600 12px Figtree, sans-serif; text-anchor: middle; dominant-baseline: middle; }
    .number-text.first { fill: #fff; }
    .label { fill: rgba(17,17,17,.62); backdrop-filter: blur(6px); }
    .label-text { fill: #fff; font: 500 10px Figtree, sans-serif; text-anchor: middle; dominant-baseline: middle; }
    .rule { width: min(16vw, 180px); height: 1px; margin-top: 32px; background: #111; }
    .kicker { margin: 22px 0 0; font: 500 clamp(18px, 2.8vw, 28px) Figtree, sans-serif; letter-spacing: .16em; }
    .count { margin: 24px 0 0; border-radius: 999px; background: rgba(17,17,17,.62); backdrop-filter: blur(6px); color: white; padding: 12px 28px; font: 500 clamp(18px, 2.5vw, 28px) Figtree, sans-serif; }
    .wordmark .rule { flex: none; }
    .tag-draw .word { margin-top: 20px; }
    @media (min-width: 768px) {
      .pieces-design, .soft-power { display: grid; grid-template-areas: "word art" ". count"; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); align-content: center; gap: 0 3vw; }
      .pieces-design .word, .soft-power .word { grid-area: word; }
      .pieces-design .art, .soft-power .art { grid-area: art; }
      .pieces-design .pieces, .soft-power .pieces { width: min(55vw, 1240px); }
      .pieces-design .count, .soft-power .count { grid-area: count; }
    }
  </style>
</head>
<body>
  <div class="wrap ${className}">${content}</div>
  <script>document.fonts.load('500 italic 140px Playfair');document.fonts.load('500 20px Figtree');</script>
</body>
</html>`;

const sizes = [
  { w: 1170, h: 2532, scale: 3, name: "splash-1170x2532.png" },
  { w: 1179, h: 2556, scale: 3, name: "splash-1179x2556.png" },
  { w: 1290, h: 2796, scale: 3, name: "splash-1290x2796.png" },
  { w: 1284, h: 2778, scale: 3, name: "splash-1284x2778.png" },
  { w: 1206, h: 2622, scale: 3, name: "splash-1206x2622.png" },
  { w: 1320, h: 2868, scale: 3, name: "splash-1320x2868.png" },
  { w: 750, h: 1334, scale: 2, name: "splash-750x1334.png" },
  { w: 1125, h: 2436, scale: 3, name: "splash-1125x2436.png" },
  { w: 1242, h: 2688, scale: 3, name: "splash-1242x2688.png" },
  { w: 828, h: 1792, scale: 2, name: "splash-828x1792.png" },
  { w: 640, h: 1136, scale: 2, name: "splash-640x1136.png" },
  { w: 1668, h: 2388, scale: 2, name: "splash-1668x2388.png" },
  { w: 1640, h: 2360, scale: 2, name: "splash-1640x2360.png" },
  { w: 2048, h: 2732, scale: 2, name: "splash-2048x2732.png" },
];

mkdirSync(outDir, { recursive: true });
const strayImage = `${outDir}splash-2048.png`;
if (existsSync(strayImage)) unlinkSync(strayImage);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

for (const size of sizes) {
  const page = await browser.newPage({
    viewport: { width: size.w / size.scale, height: size.h / size.scale },
    deviceScaleFactor: size.scale,
  });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check('500 italic 140px Playfair') || !document.fonts.check("500 20px Figtree")) {
      throw new Error("Splash fonts did not load");
    }
  });
  const buf = await page.screenshot({ type: "png", scale: "device" });
  writeFileSync(`${outDir}${size.name}`, buf);
  await page.close();
}

await browser.close();
console.log(`splash images written to public/ for ${selectedDesign}`);
