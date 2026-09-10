#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Figtree:wght@500&display=swap" />
  <style>
    html, body { margin: 0; height: 100%; background: #161310; color: #f3eee6; }
    .wrap {
      width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #161310;
    }
    .index {
      margin: 0 0 14px;
      font-family: Figtree, system-ui, sans-serif;
      font-size: 13px; font-weight: 500; letter-spacing: 0.22em;
      text-transform: uppercase; opacity: 0.48;
    }
    .art { position: relative; width: 260px; height: 468px; }
    svg { width: 100%; height: 100%; }
    .plate { fill: none; stroke: rgba(243,238,230,0.22); stroke-width: 0.7; }
    .guide { stroke: rgba(243,238,230,0.2); stroke-width: 0.55; }
    .fill { fill: #f3eee6; opacity: 0.16; }
    .stroke {
      fill: none; stroke: #f3eee6; stroke-width: 1.15;
      stroke-linecap: round; stroke-linejoin: round;
    }
    .pin {
      position: absolute; top: 36%; left: 57%;
      width: 36px; height: 36px; border-radius: 999px;
      border: 2px solid #f3eee6;
      display: flex; align-items: center; justify-content: center;
      font-family: Figtree, system-ui, sans-serif;
      font-size: 13px; font-weight: 500; letter-spacing: -0.02em;
      transform: translate(-50%, -50%);
      background: rgba(22,19,16,0.45);
    }
    .word {
      margin: 8px 0 0;
      font-family: "Cormorant Garamond", "Times New Roman", serif;
      font-style: italic; font-size: 92px; font-weight: 500;
      letter-spacing: -0.03em; line-height: 0.86;
    }
    .kicker {
      margin-top: 18px;
      font-family: Figtree, system-ui, sans-serif;
      font-size: 13px; font-weight: 500; letter-spacing: 0.22em;
      text-transform: uppercase; opacity: 0.62;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="index">Look 01</p>
    <div class="art">
      <svg viewBox="0 0 200 360" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect class="plate" x="36" y="18" width="128" height="324" />
        <line class="guide" x1="100" y1="28" x2="100" y2="330" />
        <line class="guide" x1="48" y1="78" x2="152" y2="78" />
        <line class="guide" x1="52" y1="262" x2="148" y2="262" />
        <path class="fill" d="M100 70 C86 64 74 66 66 76 C52 88 44 110 42 134 L38 170 C36 176 46 178 54 170 L62 142 L60 250 C60 258 70 264 84 264 L116 264 C130 264 140 258 140 250 L138 142 L146 170 C154 178 164 176 162 170 L158 134 C156 110 148 88 134 76 C126 66 114 64 100 70 Z" />
        <ellipse class="stroke" cx="100" cy="42" rx="9.5" ry="13" />
        <path class="stroke" d="M100 70 C86 64 74 66 66 76 C52 88 44 110 42 134 L38 170 C36 176 46 178 54 170 L62 142 L60 250 C60 258 70 264 84 264 L116 264 C130 264 140 258 140 250 L138 142 L146 170 C154 178 164 176 162 170 L158 134 C156 110 148 88 134 76 C126 66 114 64 100 70" />
        <path class="stroke" d="M88 76 L100 132 L112 76 M100 132 L100 264 M76 174 L90 174 M110 174 L124 174" />
        <path class="stroke" d="M86 264 L84 338 M78 338 L90 338 M114 264 L116 338 M110 338 L122 338 M96 264 L95 332 M104 264 L105 332" />
      </svg>
      <div class="pin">1</div>
    </div>
    <p class="word">Looktag</p>
    <p class="kicker">Shoppable looks</p>
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
  { w: 2048, h: 2048, name: "splash-2048.png" },
];

mkdirSync("/workspace/public", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const buf = await page.screenshot({ type: "png" });
  writeFileSync(`/workspace/public/${size.name}`, buf);
  await page.close();
}

await browser.close();
console.log("splash images written to public/");
