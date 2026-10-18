#!/usr/bin/env node
/**
 * Phone Create at 390x844 (#149): one Done per step, no tab bar, and the keyboard
 * docks the step's primary on the visual viewport without hiding the focused field.
 * Guest flow with a primed draft, so it needs no sign-in.
 */
import { chromium } from "playwright";
import { CREATE_DRAFT_KEY } from "../../src/lib/looks/create-draft.ts";
import { resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const viewport = { width: 390, height: 844 };
const KEYBOARD_HEIGHT = 508;
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const DRAFT = {
  id: "create-phone-draft",
  userId: "",
  title: "Numbered cut",
  caption: "",
  creator: "You",
  imageSrc: "/looks/sunday-coat.jpg",
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
const doneCount = (page) => page.getByRole("button", { name: "Done" }).count();
const tabBars = (page) => page.locator(".tab-bar").count();

async function stubKeyboard(page, offsetTop) {
  await page.evaluate(
    ([top, height]) => {
      const vv = window.visualViewport;
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: Object.assign(new EventTarget(), {
          height,
          width: vv.width,
          offsetTop: top,
          offsetLeft: 0,
          scale: 1,
        }),
      });
    },
    [offsetTop, KEYBOARD_HEIGHT],
  );
}

async function checkField(page, selector, label, offsetTop) {
  await stubKeyboard(page, offsetTop);
  await page.locator(selector).focus();
  await page.evaluate(() => window.visualViewport.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(200);
  const m = await page.evaluate((sel) => {
    const vv = window.visualViewport;
    const field = document.querySelector(sel);
    const f = field.getBoundingClientRect();
    const dock = document.querySelector("[data-kb-dock]").getBoundingClientRect();
    const corners = [
      [f.left + 2, f.top + 2],
      [f.right - 2, f.top + 2],
      [f.left + 2, f.bottom - 2],
      [f.right - 2, f.bottom - 2],
    ];
    return {
      fieldBottom: f.bottom,
      dockTop: dock.top,
      dockBottom: dock.bottom,
      vvBottom: vv.offsetTop + vv.height,
      hits: corners.every(([x, y]) => document.elementsFromPoint(x, y)[0] === field),
    };
  }, selector);
  record(
    `create-phone.keyboard.${label}@${offsetTop}`,
    Math.abs(m.dockBottom - m.vvBottom) <= 1 && m.fieldBottom <= m.dockTop - 16 + 1 && m.hits,
    JSON.stringify(m),
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
}

const browser = await chromium.launch();
try {
  await withPage(
    browser,
    origin,
    async (page) => {
      await page.addInitScript(
        ([key, raw]) => {
          try {
            sessionStorage.setItem(key, raw);
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

      record("create-phone.pin.one-done", (await doneCount(page)) === 1);
      record("create-phone.pin.no-tab-bar", (await tabBars(page)) === 0);
      const placement = await page.evaluate(() => {
        const done = [...document.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === "Done" && getComputedStyle(b).visibility !== "hidden",
        );
        const add = [...document.querySelectorAll("button")].find((b) =>
          b.textContent?.includes("Add pin"),
        );
        return {
          inActions: Boolean(done?.closest(".create-pin-actions")),
          addSolid: add ? getComputedStyle(add).backgroundColor : null,
        };
      });
      record(
        "create-phone.pin.done-beside-add-pin",
        placement.inActions,
        JSON.stringify(placement),
      );

      await page.locator("[data-tag-pin]").first().click();
      await page.locator(".create-piece").waitFor({ timeout: 5_000 });
      record("create-phone.piece.one-done", (await doneCount(page)) === 1);
      record("create-phone.piece.no-tab-bar", (await tabBars(page)) === 0);
      for (const top of [0, 120]) await checkField(page, ".create-piece-name", "piece-name", top);
      const inset = await page.evaluate(() => {
        const btn = document.querySelector(".create-piece [data-kb-dock] button");
        const r = btn.getBoundingClientRect();
        return { left: r.left, right: window.innerWidth - r.right };
      });
      record(
        "create-phone.piece.done-inset",
        inset.left >= 8 && inset.right >= 8,
        JSON.stringify(inset),
      );
      await page.locator(".create-piece").getByRole("button", { name: "Done" }).click();
      await page.waitForFunction(
        () => document.querySelector(".look-studio")?.getAttribute("data-step") === "pins",
      );

      await page.getByRole("button", { name: "Done" }).click();
      await page.getByRole("heading", { name: "Details" }).waitFor({ timeout: 8_000 });
      record("create-phone.details.no-tab-bar", (await tabBars(page)) === 0);
      for (const top of [0, 120]) {
        await checkField(page, "#create-title", "title", top);
        await checkField(page, "#create-caption", "caption", top);
      }
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("heading", { name: "Ready" }).waitFor({ timeout: 8_000 });
      record("create-phone.ready.no-tab-bar", (await tabBars(page)) === 0);
    },
    "create-phone",
    { viewport },
  );
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
