#!/usr/bin/env node
/**
 * UI coverage for every Looktag screen and the branch points on each flow.
 * Phone and desktop. The edit piece sheet must stay a footer.
 */
import { chromium } from "playwright";
import { pieceEditorIsFooter, saveDockStaysDown } from "../../src/lib/looks/edit-footer.ts";
import { CREATE_DRAFT_KEY } from "../../src/lib/looks/create-draft.ts";
import { SCREENSHOT_DIR, resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const DRAFT = {
  id: "ui-draft",
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

async function prime(page, { draft = false } = {}) {
  await page.addInitScript(
    ({ key, raw, withDraft }) => {
      try {
        sessionStorage.setItem("looktag-boot-v1", "done");
        localStorage.setItem("looktag-style-guide-v1", "done");
        localStorage.setItem("looktag-browse-coach-v1", "done");
        if (withDraft) sessionStorage.setItem(key, raw);
      } catch {
        /* private mode */
      }
    },
    { key: CREATE_DRAFT_KEY, raw: JSON.stringify(DRAFT), withDraft: draft },
  );
}

async function goto(page, path) {
  const url = `${origin}${path}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForFunction(() => {
        const root = document.querySelector("#native-screen");
        return Boolean(root && Object.keys(root).some((key) => key.startsWith("__react")));
      }, null, { timeout: 8_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(300);
    }
  }
}

async function centerDelta(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 999;
    const rect = el.getBoundingClientRect();
    return Math.abs(rect.x + rect.width / 2 - window.innerWidth / 2);
  }, selector);
}

async function box(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  }, selector);
}

async function screenHome(page) {
  await goto(page, "/");
  await page.getByRole("navigation", { name: "App" }).waitFor({ timeout: 10_000 });
  const nav = await page.getByRole("navigation", { name: "App" }).innerText();
  record("screen.home.tabs", /looks/i.test(nav) && /houses/i.test(nav) && /create/i.test(nav) && /you/i.test(nav) && !/rank/i.test(nav), nav);
  const text = await page.locator("body").innerText();
  record("screen.home.look", /Sunday Coat|Coastal|Gallery|Quiet|Studio|City/i.test(text), text.slice(0, 120));
}

async function flowHomeSnap(page) {
  await goto(page, "/");
  await page.locator(".echo-snap").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1800);
  const before = await page.evaluate(() => {
    const snap = document.querySelector(".echo-snap");
    const nav = document.querySelector('nav[aria-label="App"]');
    const titles = [...document.querySelectorAll(".echo-title")].map((el) => el.textContent.trim());
    return {
      snapType: getComputedStyle(snap).scrollSnapType,
      align: getComputedStyle(document.querySelector(".echo-plate")).scrollSnapAlign,
      height: snap.clientHeight,
      top: snap.scrollTop,
      titles,
      navTop: Math.round(nav.getBoundingClientRect().top),
    };
  });
  record("flow.home.snap-type", before.snapType === "y mandatory" && before.align === "start" && before.top < 2, `${before.snapType} ${before.align} top ${before.top}`);
  await page.locator(".echo-snap").evaluate((el, height) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: height, bubbles: true, cancelable: true }));
  }, before.height);
  await page.waitForFunction(() => {
    const snap = document.querySelector(".echo-snap");
    return Boolean(snap && Math.abs(snap.scrollTop - snap.clientHeight) < 6);
  }, null, { timeout: 3_000 }).catch(() => undefined);
  const after = await page.evaluate(() => {
    const snap = document.querySelector(".echo-snap");
    const port = snap.getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="App"]');
    const visible = [...document.querySelectorAll(".echo-title")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > port.top + 8 && rect.top < port.bottom - 8;
      })
      .map((el) => el.textContent.trim());
    return {
      scrollTop: Math.round(snap.scrollTop),
      height: snap.clientHeight,
      visible,
      navTop: Math.round(nav.getBoundingClientRect().top),
    };
  });
  record(
    "flow.home.snap-one",
    Math.abs(after.scrollTop - after.height) < 6 && after.visible.length === 1 && after.visible[0] !== before.titles[0],
    JSON.stringify(after),
  );
  record("flow.home.snap-chrome", after.navTop === before.navTop, `${before.navTop} -> ${after.navTop}`);
}

async function screenLook(page) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.getByRole("heading", { name: "Sunday Coat" }).waitFor({ timeout: 10_000 });
  const text = await page.locator("body").innerText();
  record("screen.look.shop", /Shop/.test(text) && /Sunday Coat/.test(text));
  record("screen.look.share", (await page.getByRole("button", { name: "Share" }).count()) > 0);
  await page.locator(".look-plate-echo").click();
  await page.waitForFunction(() => location.pathname === "/", null, { timeout: 8_000 });
  record("flow.look.echo", new URL(page.url()).pathname === "/");
}

async function screenCreateEntry(page) {
  await goto(page, "/create");
  await page.getByRole("heading", { name: "Create" }).waitFor({ timeout: 8_000 });
  const text = await page.locator("body").innerText();
  record(
    "screen.create.entry",
    /Start with a look/.test(text) && /Choose photo/.test(text) && /Camera/.test(text),
    text.slice(0, 140),
  );
}

async function flowCreateBranches(page) {
  await goto(page, "/create");
  await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
  record("flow.create.pins", (await page.locator(".look-studio").getAttribute("data-step")) === "pins");
  record("flow.create.find", (await page.getByRole("button", { name: /Find pieces/i }).count()) > 0);
  record("flow.create.add-pin", (await page.getByRole("button", { name: "Add pin" }).count()) > 0);

  await page.locator("[data-tag-pin]").first().click();
  await page.locator(".create-piece").waitFor({ timeout: 5_000 });
  const piece = await page.evaluate(() => {
    const card = document.querySelector(".create-piece");
    const plate = document.querySelector(".create-plate");
    const c = card.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    return { cardTop: c.top, cardBottom: c.bottom, plateTop: p.top, plateBottom: p.bottom };
  });
  record(
    "flow.create.piece-footer",
    pieceEditorIsFooter(piece.cardTop, piece.cardBottom, piece.plateTop, piece.plateBottom),
    JSON.stringify(piece),
  );
  const pinTitle = await centerDelta(page, ".create-plate-title");
  record("flow.header.pin-title", pinTitle <= 8, String(Math.round(pinTitle)));
  await page.locator(".create-plate-back").click();
  record("flow.create.piece-header-back", (await page.locator(".look-studio").getAttribute("data-step")) === "pins");
  await page.locator("[data-tag-pin]").first().click();
  await page.locator(".create-piece").waitFor({ timeout: 5_000 });
  await page.locator(".create-piece").getByRole("button", { name: "Done" }).click();
  record("flow.create.piece-back", (await page.locator(".look-studio").getAttribute("data-step")) === "pins");

  await page.getByRole("button", { name: "Done" }).first().click();
  await page.getByRole("heading", { name: "Details" }).waitFor({ timeout: 5_000 });
  await page.locator("#create-title").fill("");
  await page.getByRole("button", { name: "Continue" }).click();
  record("flow.create.title-required", (await page.getByRole("heading", { name: "Details" }).count()) > 0);

  await page.locator("#create-title").fill("Numbered cut");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Ready" }).waitFor({ timeout: 5_000 });
  const dock = await box(page, ".create-paper-dock");
  const height = page.viewportSize().height;
  record(
    "flow.create.ready-dock",
    dock && saveDockStaysDown(dock.top, dock.bottom, height),
    JSON.stringify(dock),
  );

  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("heading", { name: /Sign in to publish/i }).waitFor({ timeout: 5_000 });
  record("flow.create.publish-gate", true);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  const ready = await page.locator("body").innerText();
  record("flow.create.publish-cancel", /Ready/.test(ready) && !/Sign in to publish/i.test(ready), ready.slice(0, 160));
  record("flow.create.save-draft", /Save draft/.test(ready));
}

async function screenHouses(page) {
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 10_000 });
  const text = await page.locator("body").innerText();
  record("screen.houses.scouted", /Scouted/.test(text) && /Atelier Noir/.test(text) && /Picked by Looktag/.test(text), text.slice(0, 180));
  record("screen.houses.more", /More houses/.test(text));
  record("screen.houses.for", /For houses/.test(text));
  const covers = await page.locator(".house-card img").count();
  record("screen.houses.covers", covers >= 4, String(covers));
  await page.getByRole("link", { name: "Atelier Noir", exact: true }).click();
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  const profile = await page.locator("body").innerText();
  record("screen.house.profile", /Scouted/i.test(profile) && /Lines/.test(profile) && /Kinkistyles/.test(profile), profile.slice(0, 220));
  const hero = await page.locator(".house-hero").getAttribute("src");
  record("screen.house.hero", Boolean(hero && hero.includes("/looks/")), hero ?? "");
  const houseTitle = await centerDelta(page, ".native-header-title");
  record("flow.header.house-title", houseTitle <= 8, String(Math.round(houseTitle)));
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForFunction(() => location.pathname === "/houses", null, { timeout: 8_000 });
  record("flow.header.back", new URL(page.url()).pathname === "/houses");
  await goto(page, "/houses/label-atelier-noir/kinkistyles");
  await page.getByRole("heading", { name: "Kinkistyles", exact: true }).waitFor({ timeout: 8_000 });
  const line = await page.locator("body").innerText();
  record("screen.house.line", /Styles/.test(line) && /Column Dress/.test(line) && !/Pins/.test(line), line.slice(0, 180));
  await page.getByRole("link", { name: "Column Dress", exact: true }).click();
  await page.getByRole("heading", { name: "Column Dress", exact: true }).waitFor({ timeout: 8_000 });
  const style = await page.locator("body").innerText();
  record("screen.house.style", /Column Dress/.test(style) && !/Shop/.test(style) && !/\$/.test(style), style.slice(0, 180));
  const photo = await page.locator(".style-detail img").first().getAttribute("src");
  record(
    "screen.house.style-photo",
    Boolean(photo && photo.includes("gallery-hour")) && !/Visit /.test(style),
    photo ?? "",
  );
  await goto(page, "/houses/label-atelier-noir");
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForFunction(() => location.pathname === "/houses", null, { timeout: 8_000 });
  record("flow.header.back-direct", new URL(page.url()).pathname === "/houses");
}

async function flowHouseGate(page) {
  await goto(page, "/houses");
  await page.locator(".native-header-trailing").getByRole("link", { name: "For houses" }).click();
  await page.waitForURL((url) => url.pathname === "/house", { timeout: 8_000 });
  await page.getByText("Continue with email").waitFor({ timeout: 8_000 });
  const text = await page.locator("body").innerText();
  record("flow.house.gate", /For houses/.test(text) && /Continue with email/i.test(text), text.slice(0, 160));
  const tab = await page.locator(".tab-bar").evaluate((el) => getComputedStyle(el).display).catch(() => "missing");
  record("flow.house.split-hides-tabs", tab === "none", tab);
}

async function flowYou(page) {
  await goto(page, "/login");
  await page.getByRole("heading", { name: "You" }).waitFor({ timeout: 8_000 });
  record("screen.you.saved", /Saved/.test(await page.locator("body").innerText()));
  await page.getByRole("tab", { name: "Drafts" }).click();
  record("flow.you.drafts", /In progress/.test(await page.locator("body").innerText()));
  await page.getByRole("tab", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Sign in to sync You" }).waitFor({ timeout: 5_000 });
  record("flow.you.profile-gate", true);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  record("flow.you.profile-cancel", /You/.test(await page.locator("body").innerText()));
}

async function flowAdminCancel(page) {
  await goto(page, "/admin");
  await page.getByRole("heading", { name: /Sign in for admin/i }).waitFor({ timeout: 8_000 });
  record("screen.admin.gate", /System tools/i.test(await page.locator("body").innerText()));
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 8_000 });
  record("flow.admin.cancel", new URL(page.url()).pathname === "/");
}

async function screenEditGuest(page) {
  await goto(page, "/looks/seed-sunday-coat/edit");
  await page.getByRole("heading", { name: /Sign in to edit/i }).waitFor({ timeout: 8_000 });
  record("screen.edit.guest", /Only the creator can change a look/.test(await page.locator("body").innerText()));
}

async function flowSignedInEdit(page) {
  const stamp = Date.now().toString(36);
  await goto(page, `/login?next=${encodeURIComponent("/create")}`);
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.locator("#creator-name").fill("UI Tester");
  await page.locator("#creator-handle").fill(`ui${stamp.slice(-6)}`);
  await page.locator("#creator-city").fill("Berlin");
  await page.locator("#creator-email").fill(`ui-${stamp}@looktag.test`);
  await page.locator("#creator-password").fill("looktag-e2e-pass-1");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  await page.evaluate(
    ({ key, raw }) => sessionStorage.setItem(key, raw),
    { key: CREATE_DRAFT_KEY, raw: JSON.stringify({ ...DRAFT, id: `ui-${stamp}`, title: "Footer cut" }) },
  );
  await goto(page, "/create");
  await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
  if ((await page.locator(".look-studio").getAttribute("data-step")) === "pins") {
    await page.getByRole("button", { name: "Done" }).first().click();
    await page.locator("#create-title").fill("Footer cut");
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForURL(/\/looks\//, { timeout: 15_000 });
  record("flow.edit.published", /\/looks\//.test(page.url()));

  await goto(page, `${new URL(page.url()).pathname}/edit`);
  await page.getByRole("heading", { name: "Edit look" }).waitFor({ timeout: 8_000 });
  const dock = await box(page, ".create-paper-dock");
  const height = page.viewportSize().height;
  record(
    "flow.edit.footer",
    dock && saveDockStaysDown(dock.top, dock.bottom, height),
    JSON.stringify({ dock, height }),
  );
  await page.getByRole("button", { name: "Pin pieces" }).click();
  await page.locator("[data-tag-pin]").first().click();
  await page.locator(".create-piece").waitFor({ timeout: 5_000 });
  const piece = await page.evaluate(() => {
    const card = document.querySelector(".create-piece");
    const plate = document.querySelector(".create-plate");
    const c = card.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    return { cardTop: c.top, cardBottom: c.bottom, plateTop: p.top, plateBottom: p.bottom };
  });
  record(
    "flow.edit.piece-footer",
    pieceEditorIsFooter(piece.cardTop, piece.cardBottom, piece.plateTop, piece.plateBottom),
    JSON.stringify(piece),
  );
}

async function screenDesktop(page) {
  await goto(page, "/");
  const nav = page.locator(".web-nav");
  await nav.waitFor({ timeout: 8_000 });
  const text = await nav.innerText();
  const header = await page.locator(".web-header").innerText();
  record(
    "screen.desktop.nav",
    /Looks/.test(text) && /Houses/.test(text) && /Create/.test(text) && /You/.test(text) && !/Rank/.test(text) && !/Get the app/.test(header) && text.indexOf("Looks") < text.indexOf("Houses") && text.indexOf("Houses") < text.indexOf("Create"),
    `${text} | ${header}`,
  );
  await page.locator(".wide-pagehd").waitFor({ timeout: 8_000 });
  const pageHead = await page.locator(".wide-pagehd").innerText();
  record("screen.desktop.houses-link", /For you/.test(pageHead) && !/Houses/.test(pageHead), pageHead);
  const order = await page.evaluate(() => {
    const word = document.querySelector(".web-wordmark")?.getBoundingClientRect();
    const tabs = document.querySelector(".web-nav")?.getBoundingClientRect();
    if (!word || !tabs) return false;
    return tabs.left > word.right - 8 && word.left < 120;
  });
  record("flow.header.desktop-nav", order, String(order));
  await goto(page, "/looks/seed-sunday-coat");
  await page.getByRole("heading", { name: "Sunday Coat", exact: true }).waitFor({ timeout: 8_000 });
  const lookText = await page.locator("body").innerText();
  record("screen.desktop.look", /Shop this look/.test(lookText) && !/\$/.test(lookText), lookText.slice(0, 180));
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 8_000 });
  record("screen.desktop.houses", /Scouted/.test(await page.locator("body").innerText()));
  await goto(page, "/rank");
  record("screen.rank", (await page.locator("body").innerText()).length > 20);
}

const phone = { viewport: { width: 390, height: 844 } };
const desk = { viewport: { width: 1280, height: 800 } };

const browser = await chromium.launch({ headless: true });
try {
  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenHome(page);
    await flowHomeSnap(page);
    await screenLook(page);
    await screenCreateEntry(page);
    await screenHouses(page);
    await flowHouseGate(page);
    await flowYou(page);
    await flowAdminCancel(page);
    await screenEditGuest(page);
  }, "ui-phone", phone);

  await withPage(browser, origin, async (page) => {
    await prime(page, { draft: true });
    await flowCreateBranches(page);
  }, "ui-create", phone);

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenDesktop(page);
  }, "ui-desktop", desk);

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowSignedInEdit(page);
  }, "ui-edit", { viewport: { width: 390, height: 844 } });

  await withPage(browser, origin, async (page) => {
    await prime(page, { draft: true });
    await goto(page, "/create");
    await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
    await page.getByRole("button", { name: "Done" }).first().click();
    await page.locator("#create-title").fill("Wide cut");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Ready" }).waitFor({ timeout: 5_000 });
    const dock = await box(page, ".create-paper-dock");
    record(
      "flow.desktop.ready-dock",
      dock && saveDockStaysDown(dock.top, dock.bottom, 800),
      JSON.stringify(dock),
    );
  }, "ui-desktop-ready", desk);
} finally {
  await browser.close();
}

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} ui checks passed`);
if (failed.length) {
  console.log("failed:", failed.map((row) => row.name).join(", "));
  console.log(`screenshots: ${SCREENSHOT_DIR}`);
  process.exit(1);
}
