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
  const design = elegant
    ? {
        svg: readFileSync(`${root}src/lib/pwa/splash-soft-power.svg`, "utf8"),
        labels: ["Satin blouse", "Wide-leg trousers", "Clutch", "Kitten heels"],
        positions: [
          [55, 16.67, "right"],
          [48.75, 63.33, "right"],
          [52.08, 83, "right"],
          [60.83, 92.33, "right"],
        ],
      }
    : {
        svg: readFileSync(`${root}src/lib/pwa/splash-pieces.svg`, "utf8"),
        labels: ["Linen shirt", "Raffia tote", "Pleated shorts", "Espadrilles"],
        positions: [
          [55.8, 20.2, "right"],
          [85.5, 49.6, "left"],
          [33.7, 62, "left"],
          [57, 90.7, "right"],
        ],
      };
  const boxClass = elegant ? "soft-power" : "pieces";
  return `<div class="box ${boxClass}">${design.svg}${design.positions.map(([left, top, direction], i) => `
    <span class="pin ${i === 0 ? "first" : ""}" style="left:${left}%;top:${top}%">${i + 1}</span>
    <span class="pill ${direction === "left" ? "left" : ""}" style="left:${left}%;top:${top}%">${design.labels[i]}</span>`).join("")}
  </div>`;
};

const art = {
  wordmark: '<div class="rule"></div>',
  "tag-draw": `<svg class="tag" viewBox="0 0 64 40" width="72" height="45" fill="none" stroke="#111" stroke-width="1.6" stroke-linejoin="round">
    <path d="M18 3H59a2 2 0 0 1 2 2v30a2 2 0 0 1-2 2H18L3 20Z" />
    <circle cx="17" cy="20" r="3.2" />
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
  ? `<div class="mark">${word}${art.wordmark}</div>`
  : selectedDesign === "tag-draw"
    ? `<div class="art">${art[selectedDesign]}</div><div class="mark">${word}</div><p class="kicker">SHOP THE LOOK</p>`
    : `<div class="side">${word}<p class="count">4 pieces tagged</p></div>${art[selectedDesign]}`;

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @font-face { font-family: Playfair; src: url(data:font/woff2;base64,${playfair}) format("woff2"); font-style: italic; font-weight: 500; font-display: block; }
    @font-face { font-family: Figtree; src: url(data:font/woff2;base64,${figtree}) format("woff2"); font-style: normal; font-weight: 500; font-display: block; }
    html, body { margin: 0; width: 100%; height: 100%; background: #F4F4F4; color: #111; }
    .wrap { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 24px; background: #F4F4F4; color: #111; }
    .word { margin: 0; color: #111; font: italic 500 clamp(44px, 12vw, 64px)/1 Playfair, serif; letter-spacing: -.01em; }
    .mark { display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .rule { width: min(132px, 30vw); height: 1.5px; background: #111; }
    .tag { display: block; width: 72px; height: 45px; }
    .art { display: flex; flex-direction: column; align-items: center; }
    .kicker { margin: 0; font: 500 13px/1 Figtree, sans-serif; letter-spacing: .14em; opacity: .55; }
    .box { position: relative; width: min(62vw, 290px); aspect-ratio: 2 / 3; }
    .box.soft-power { width: min(86vw, 360px); aspect-ratio: 4 / 5; }
    .boot-piece-illustration { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
    .pin { position: absolute; z-index: 1; display: block; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; background: #fff; color: #111; font: 600 13px/28px Figtree, sans-serif; text-align: center; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
    .pin.first { background: #111; color: #fff; }
    .pill, .count { border-radius: 999px; background: rgba(17,17,17,.62); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #fff; font: 500 12px/1 Figtree, sans-serif; padding: 7px 11px; }
    .pill { position: absolute; z-index: 2; white-space: nowrap; transform: translate(22px,-50%); }
    .pill.left { transform: translate(calc(-100% - 22px),-50%); }
    .side { display: contents; }
    .pieces-design .word, .soft-power .word { order: 0; font-size: clamp(44px,12vw,56px); }
    .pieces-design .box, .soft-power .box { order: 1; }
    .count { order: 2; margin: 0; }
    @media (min-width: 600px) and (max-aspect-ratio: 1/1) {
      .pieces-design .box { width: 56vw; }
      .soft-power .box { width: 68vw; }
      .wrap .word { font-size: 88px; }
    }
    @media (max-height: 700px) and (max-width: 599px) {
      .pieces-design { gap: 18px; }
      .pieces-design .box { width: min(52vw,260px); }
      .soft-power { gap: 16px; }
      .soft-power .box { width: min(80vw,330px); }
    }
    @media (min-aspect-ratio: 1/1) {
      .pieces-design, .soft-power { flex-direction: row; gap: 96px; }
      .soft-power { gap: 72px; }
      .side { display: flex; flex-direction: column; align-items: center; gap: 24px; }
      .pieces-design .box { width: auto; height: 70vh; }
      .soft-power .box { width: auto; height: 74vh; }
      .pieces-design .word, .soft-power .word { font-size: clamp(64px,7vw,104px); }
    }
    @media (min-width: 600px) and (max-aspect-ratio: 1/1) {
      .pieces-design, .soft-power { gap: 28px; }
    }
    @media (max-width: 599px) and (min-aspect-ratio: 1/1) {
      .pieces-design .side, .soft-power .side { display: flex; flex-direction: column; align-items: center; gap: 12px; }
      .pieces-design .box { height: min(70vh,70vw); }
      .soft-power .box { height: min(74vh,74vw); }
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
