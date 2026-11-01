#!/usr/bin/env node
/**
 * Google sign-in shows by default once the server has Google credentials.
 *   GOOGLE_EXPECT=on  → server runs with (dummy) GOOGLE_CLIENT_ID/SECRET: button renders.
 *   GOOGLE_EXPECT=off → server runs without them: button is absent.
 *   BASE_URL=http://127.0.0.1:8080 GOOGLE_EXPECT=on node tests/e2e/google-signin.mjs
 * SHOT_DIR=docs/pr-previews/google-signin → also save screenshots.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL || process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const EXPECT = process.env.GOOGLE_EXPECT === "off" ? "off" : "on";
const SHOT_DIR = process.env.SHOT_DIR || "";
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1194 },
];

if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/login?next=%2Fcreate`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator('[data-settings-hydrated="true"]').waitFor({ timeout: 15_000 });
      const google = page.getByRole("button", { name: "Continue with Google" });
      if (EXPECT === "on") {
        await google.waitFor({ timeout: 10_000 });
        assert.equal(await google.isVisible(), true, `Google button visible at ${vp.width}px`);
        assert.equal(
          await page.getByRole("button", { name: "Continue with Apple" }).count(),
          0,
          "Apple is not configured, so it is not offered",
        );
        // The click goes to the app's own Google client, not the broker.
        let body = null;
        await page.route("**/api/auth/sign-in/social", async (route) => {
          body = route.request().postDataJSON();
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        });
        await google.click();
        await page.waitForTimeout(1_000);
        assert.equal(body?.provider, "google", "button signs in with provider=google");
        await page.unroute("**/api/auth/sign-in/social");
        await page.goto(`${BASE}/login?next=%2Fcreate`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.locator('[data-settings-hydrated="true"]').waitFor({ timeout: 15_000 });
        await google.waitFor({ timeout: 10_000 });
      } else {
        await page.waitForTimeout(500);
        assert.equal(await google.count(), 0, `Google button absent at ${vp.width}px`);
      }
      if (SHOT_DIR) {
        await page.screenshot({ path: join(SHOT_DIR, `login-${EXPECT}-${vp.width}.png`) });
      }
      console.log(`ok  google sign-in ${EXPECT} at ${vp.width}x${vp.height}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
