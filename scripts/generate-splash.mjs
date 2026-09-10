#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

/** OS launch image — ink wordmark only, never the Classy coat. */
const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Figtree:wght@500&display=swap" />
  <style>
    html, body { margin: 0; height: 100%; background: #111111; color: #f3eee6; }
    .wrap {
      width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #111111;
    }
    .word {
      margin: 0;
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
  await page.waitForTimeout(400);
  const buf = await page.screenshot({ type: "png" });
  writeFileSync(`/workspace/public/${size.name}`, buf);
  await page.close();
}

await browser.close();
console.log("splash images written to public/");
