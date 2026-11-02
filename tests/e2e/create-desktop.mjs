#!/usr/bin/env node
/**
 * Desktop Create (#204): real file chooser and drag-and-drop photo entry, honest
 * (non-camera) labels, no footer overlap on the crop step, one Done and Add pin opening
 * the piece card on the pin step, and an explicit remove-photo action. Guest flow.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { resolveOrigin, clearUploadedDrafts, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const widths = [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const PHOTO = new URL("../../public/looks/sunday-coat.jpg", import.meta.url);
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const step = (page) => page.locator(".look-studio").getAttribute("data-step");

async function overlaps(page, aSel, bSel) {
  return page.evaluate(
    ([a, b]) => {
      const ra = document.querySelector(a)?.getBoundingClientRect();
      const rb = document.querySelector(b)?.getBoundingClientRect();
      if (!ra || !rb) return false;
      return ra.left < rb.right && ra.right > rb.left && ra.top < rb.bottom && ra.bottom > rb.top;
    },
    [aSel, bSel],
  );
}

async function openCreate(page) {
  await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Create" }).waitFor();
}

async function reachCrop(page, mode) {
  if (mode === "chooser") {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Upload photo" }).click(),
    ]);
    await chooser.setFiles(new URL("../../public/looks/sunday-coat.jpg", import.meta.url).pathname);
  } else {
    const data = readFileSync(PHOTO).toString("base64");
    const transfer = await page.evaluateHandle(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "look.jpg", { type: "image/jpeg" }));
      return dt;
    }, data);
    await page.dispatchEvent(".create-entry-plate", "drop", { dataTransfer: transfer });
  }
  await page.locator(".create-crop-step").waitFor();
}

const browser = await chromium.launch();
try {
  for (const viewport of widths) {
    const tag = `${viewport.width}`;
    for (const mode of ["chooser", "drop"]) {
      await withPage(
        browser,
        origin,
        async (page) => {
          await openCreate(page);
          const text = await page.locator("body").innerText();
          record(`create-desktop.${tag}.${mode}.copy`, /drag and drop/i.test(text) && !/Camera|Take photo/.test(text));
          await reachCrop(page, mode);
          record(
            `create-desktop.${tag}.${mode}.crop-no-overlap`,
            !(await overlaps(page, ".crop-actions", ".crop-frame")),
          );
          if (mode === "chooser") {
            await page.getByRole("button", { name: "Remove photo" }).click();
            await page.getByRole("button", { name: "Upload photo" }).waitFor();
            record(`create-desktop.${tag}.remove-photo`, true);
            await reachCrop(page, "chooser");
          }
          await page.getByRole("button", { name: "Use photo" }).click();
          await page.locator(".create-plate").waitFor();
          record(
            `create-desktop.${tag}.pins.one-done`,
            (await page.getByRole("button", { name: "Done" }).count()) === 1,
          );
          await page.getByRole("button", { name: "Add pin" }).click();
          await page.getByRole("dialog", { name: "Edit piece" }).waitFor();
          record(`create-desktop.${tag}.add-pin-opens-piece`, true);
          await clearUploadedDrafts(page);
        },
        `create-desktop-${tag}-${mode}`,
        { viewport },
      ).catch((error) => record(`create-desktop.${tag}.${mode}`, false, String(error.message).split("\n")[0]));
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
