#!/usr/bin/env node
/**
 * Desktop Create (#203): Find pieces states, pin → piece card in the right pane,
 * Details Title/Continue in the right pane above the fold, guest path to Publish ready,
 * and honest Save draft. Guest flow with a primed draft, no sign-in needed.
 * SHOTS_DIR=docs/pr-previews writes PR screenshots (1280×800, 834, 390×844).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { CREATE_DRAFT_KEY } from "../../src/lib/looks/create-draft.ts";
import { resolveOrigin, clearUploadedDrafts, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const shots = process.env.SHOTS_DIR || "";
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const DRAFT = {
  id: "create-desktop-draft",
  userId: "",
  title: "",
  caption: "",
  creator: "You",
  imageSrc: "/looks/sunday-coat.jpg",
  crop: { x: 0, y: 0, w: 1, h: 1 },
  createdAt: 1,
  updatedAt: 1,
  tags: [
    {
      id: "pin-1",
      x: 48,
      y: 40,
      name: "Coat",
      brand: "Zara",
      price: "",
      currency: "EUR",
      url: "",
      retailerId: "zara",
      offers: [],
    },
  ],
};

const step = (page) => page.locator(".look-studio").getAttribute("data-step");

async function shot(page, name) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}

async function box(page, selector) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vh: innerHeight };
  });
}

async function openPins(page) {
  await page.addInitScript(
    ([key, raw]) => {
      try {
        if (!sessionStorage.getItem("create-desktop-primed")) {
          sessionStorage.setItem(key, raw);
          sessionStorage.setItem("create-desktop-primed", "1");
        }
      } catch {
        /* private mode */
      }
    },
    [CREATE_DRAFT_KEY, JSON.stringify(DRAFT)],
  );
  await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
  await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 10_000 });
  if ((await step(page)) === "crop") {
    await page.locator(".crop-frame").waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.waitForFunction(
    () => document.querySelector(".look-studio")?.getAttribute("data-step") === "pins",
    null,
    { timeout: 8_000 },
  );
}

async function flow(page, width, height) {
  const tag = `@${width}`;
  const desktop = width >= 1024;
  await openPins(page);
  // Let the AI status call land.
  await page.waitForTimeout(800);

  const find = page.getByRole("button", { name: "Find pieces in photo" });
  record(`create-desktop.find.visible${tag}`, await find.isVisible());
  const state = await page.locator("[data-find-state]").getAttribute("data-find-state");
  if (state === "unavailable") {
    record(`create-desktop.find.unavailable-disabled${tag}`, (await find.getAttribute("aria-disabled")) === "true");
    record(
      `create-desktop.find.unavailable-copy${tag}`,
      await page.getByText("AI find isn’t available right now.").isVisible(),
    );
  } else if (state === "gated") {
    await find.click();
    const sheet = page.getByRole("dialog", { name: "Sign in to find pieces" });
    record(`create-desktop.find.gated-sheet${tag}`, await sheet.isVisible({ timeout: 5_000 }).catch(() => false));
    await shot(page, `create-find-gated-${width}`);
    await page.getByRole("button", { name: "Cancel" }).click();
    await sheet.waitFor({ state: "hidden", timeout: 5_000 });
    record(`create-desktop.find.gated-cancel-keeps-pins${tag}`, (await page.locator("[data-tag-pin]").count()) === 1);
  } else {
    record(`create-desktop.find.state${tag}`, state === "free", String(state));
  }
  record(
    `create-desktop.find.add-pin-primary${tag}`,
    await page.getByRole("button", { name: "Add pin" }).isVisible(),
  );
  await shot(page, `create-pins-${width}`);

  await page.getByRole("button", { name: "Add pin" }).click();
  await page.locator(".create-piece").waitFor({ timeout: 5_000 });
  record(`create-desktop.pin.add-opens-piece${tag}`, (await step(page)) === "piece");
  if (desktop) {
    const plate = await box(page, ".create-plate-canvas");
    const card = await box(page, ".create-piece");
    record(`create-desktop.pin.piece-right-pane${tag}`, card.left >= plate.right - 1, JSON.stringify({ plate, card }));
  }
  await shot(page, `create-piece-${width}`);
  await page.locator(".create-piece").getByRole("button", { name: "Remove" }).click();
  await page.waitForFunction(() => document.querySelector(".look-studio")?.getAttribute("data-step") === "pins");

  await page.locator(".create-pin-actions").getByRole("button", { name: "Done" }).click();
  await page.getByRole("heading", { name: "Details" }).waitFor({ timeout: 8_000 });
  const title = await box(page, "#create-title");
  const cont = await box(page, ".create-details-dock button");
  record(`create-desktop.details.title-above-fold${tag}`, title.bottom <= title.vh && title.top >= 0, JSON.stringify(title));
  if (desktop) {
    const photo = await box(page, ".create-details-photo");
    record(`create-desktop.details.right-pane${tag}`, title.left >= photo.right - 1 && cont.left >= photo.right - 1);
    record(`create-desktop.details.continue-above-fold${tag}`, cont.bottom <= cont.vh, JSON.stringify(cont));
  }
  await shot(page, `create-details-${width}`);
  record(`create-desktop.details.continue-aria-disabled${tag}`, (await page.getByRole("button", { name: "Continue" }).getAttribute("aria-disabled")) === "true");
  await page.getByRole("button", { name: "Continue" }).click({ force: true });
  record(`create-desktop.details.add-a-title${tag}`, await page.getByRole("alert").filter({ hasText: "Add a title" }).isVisible());
  record(
    `create-desktop.details.focus-title${tag}`,
    await page.evaluate(() => document.activeElement?.id === "create-title"),
  );
  record(`create-desktop.details.blocked-stays${tag}`, (await step(page)) === "details");
  await page.locator("#create-title").fill("Saturday coat");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Ready" }).waitFor({ timeout: 8_000 });

  const publish = await box(page, ".create-ready-dock .create-btn-primary");
  const draft = await box(page, ".create-btn-draft");
  record(
    `create-desktop.ready.ctas-above-fold${tag}`,
    publish.bottom <= publish.vh && draft.bottom <= draft.vh,
    JSON.stringify({ publish, draft }),
  );
  if (desktop) {
    record(
      `create-desktop.ready.summary-title${tag}`,
      await page.locator(".create-ready-title").filter({ hasText: "Saturday coat" }).isVisible(),
    );
  }
  await shot(page, `create-ready-${width}`);

  await page.getByRole("button", { name: "Save draft" }).click();
  const saveSheet = page.getByRole("dialog", { name: "Sign in to save" });
  record(`create-desktop.ready.guest-save-sheet${tag}`, await saveSheet.isVisible({ timeout: 5_000 }).catch(() => false));
  await page.getByRole("button", { name: "Cancel" }).click();
  await saveSheet.waitFor({ state: "hidden", timeout: 5_000 });
  record(`create-desktop.ready.cancel-keeps-look${tag}`, (await step(page)) === "publish");
  const kept = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || "{}"), CREATE_DRAFT_KEY);
  record(
    `create-desktop.ready.draft-intact${tag}`,
    kept.title === "Saturday coat" && kept.tags?.length === 1 && Boolean(kept.imageSrc),
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  record(
    `create-desktop.ready.guest-publish-sheet${tag}`,
    await page.getByRole("dialog", { name: "Sign in to publish" }).isVisible({ timeout: 5_000 }).catch(() => false),
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await clearUploadedDrafts(page);
}

const browser = await chromium.launch();
try {
  for (const [width, height] of [
    [1280, 800],
    [834, 1112],
    [390, 844],
  ]) {
    await withPage(browser, origin, (page) => flow(page, width, height), `create-desktop-${width}`, {
      viewport: { width, height },
    });
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
