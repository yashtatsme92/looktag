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
  record("screen.home.following", /Following/.test(text) && /For you/.test(text));
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
  await page.locator(".tag-pin").nth(1).click();
  const card = page.getByRole("dialog", { name: "Selected piece" });
  await card.waitFor({ timeout: 4_000 });
  const cardText = await card.innerText();
  record(
    "flow.look.spotlight-card",
    /Cashmere Turtleneck/.test(cardText) && /Uniqlo/.test(cardText) && /Shop/.test(cardText) && !/[$€]/.test(cardText),
    cardText.replace(/\s+/g, " "),
  );
  record(
    "flow.look.spotlight-whole",
    (await page.locator(".look-plate-shop-whole").count()) === 1 && (await page.locator(".look-plate-shop").count()) === 0,
  );
  await card.getByRole("button", { name: "Dismiss" }).click();
  record("flow.look.spotlight-dismiss", (await card.count()) === 0);
  // Style-linked pin: Style name as the title, House beneath, ghost View Style beside Shop, no piece name.
  await page.locator(".tag-pin").nth(0).click();
  await card.waitFor({ timeout: 4_000 });
  const viewStyle = card.getByRole("link", { name: "View Style" });
  await viewStyle.waitFor({ timeout: 6_000 });
  const styleText = (await card.innerText()).replace(/\s+/g, " ");
  const viewBox = await viewStyle.boundingBox();
  record(
    "flow.look.spotlight-style",
    /Column Dress/.test(styleText) &&
      /Atelier Noir/.test(styleText) &&
      !/Oversized Wool Coat/.test(styleText) &&
      !/No close match yet/.test(styleText) &&
      Boolean(viewBox) &&
      Math.round(viewBox.height) === 44 &&
      (await card.getByRole("button", { name: "Shop" }).count()) === 1,
    styleText,
  );
  // Shop sits on the left, View Style on the right, and Shop is named for the piece.
  const shopBtn = card.getByRole("button", { name: "Shop Oversized Wool Coat" });
  const shopBox = await shopBtn.boundingBox();
  record(
    "flow.look.spotlight-order",
    Boolean(shopBox && viewBox) && shopBox.x + shopBox.width <= viewBox.x + 1 && (await shopBtn.count()) === 1,
    JSON.stringify({ shop: shopBox, view: viewBox }),
  );
  // Focus moves into the dialog when it opens.
  const focusInCard = await page.evaluate(() => document.activeElement?.getAttribute("role") === "dialog");
  record("flow.look.spotlight-focus", focusInCard);
  // Arrow keys step between pins.
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => /Cashmere Turtleneck/.test(document.querySelector('[role="dialog"]')?.textContent ?? ""), null, { timeout: 3_000 }).catch(() => undefined);
  const stepped = (await card.innerText()).replace(/\s+/g, " ");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => /Column Dress/.test(document.querySelector('[role="dialog"]')?.textContent ?? ""), null, { timeout: 3_000 }).catch(() => undefined);
  const back = (await card.innerText()).replace(/\s+/g, " ");
  record("flow.look.spotlight-arrows", /Cashmere Turtleneck/.test(stepped) && /Column Dress/.test(back), `${stepped} | ${back}`);
  // Esc is scoped to the plate: a key event elsewhere in the document leaves the card open.
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  const stillOpen = (await card.count()) === 1;
  await page.keyboard.press("Escape");
  const pinFocused = await page
    .waitForFunction(() => document.activeElement?.classList.contains("tag-pin") ?? false, null, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  record("flow.look.spotlight-esc", stillOpen && (await card.count()) === 0, `stillOpen=${stillOpen}`);
  record("flow.look.spotlight-focus-return", pinFocused);
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
  const doneGhost = await page.evaluate(() => {
    const el = document.querySelector(".create-pin-actions .create-btn-done");
    if (!el) return null;
    const style = getComputedStyle(el);
    return { height: Math.round(el.getBoundingClientRect().height), border: style.borderTopWidth };
  });
  record("flow.create.done-ghost", doneGhost?.height === 44 && doneGhost.border === "1px", JSON.stringify(doneGhost));
  const phoneAdd = await page.evaluate(() => {
    const el = document.querySelector(".create-pin-actions .create-btn-pin");
    if (!el) return null;
    const style = getComputedStyle(el);
    return { bg: style.backgroundColor, color: style.color };
  });
  record(
    "flow.create.add-pin-phone-unchanged",
    phoneAdd?.bg === "rgb(255, 255, 255)" && phoneAdd.color === "rgb(17, 17, 17)",
    JSON.stringify(phoneAdd),
  );

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
  const scoutedHead = await page.evaluate(() => {
    const row = document.querySelector("#houses-scouted")?.parentElement;
    return { dot: Boolean(row?.querySelector(".houses-scouted-dot")), pill: Boolean(row?.querySelector(".scouted-mark")) };
  });
  record("screen.houses.scouted-dot", scoutedHead.dot && !scoutedHead.pill, JSON.stringify(scoutedHead));
  record("screen.houses.for", /For houses/.test(text));
  const covers = await page.locator(".house-card img").count();
  record("screen.houses.covers", covers >= 4, String(covers));
  await page.getByRole("link", { name: "Atelier Noir", exact: true }).click();
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  const profile = await page.locator("body").innerText();
  record("screen.house.profile", /Scouted/i.test(profile) && /Lines/.test(profile) && /Kinkistyles/.test(profile), profile.slice(0, 220));
  const followBox = await page.evaluate(() => {
    const follow = document.querySelector(".house-profile .house-follow")?.getBoundingClientRect();
    const profile = document.querySelector(".house-profile")?.getBoundingClientRect();
    return follow && profile ? { followW: Math.round(follow.width), followH: Math.round(follow.height), profileW: Math.round(profile.width) } : null;
  });
  record(
    "screen.house.follow-full",
    Boolean(followBox) && followBox.followW >= followBox.profileW - 2 && followBox.followH === 44,
    JSON.stringify(followBox),
  );
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
  const lineKicker = (await page.locator(".house-line-kicker").innerText()).replace(/\s+/g, " ");
  record("screen.house.line-kicker", /^ATELIER NOIR · LINE$/i.test(lineKicker) && !/Capsule/.test(line), lineKicker);
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
  const pill = await page.evaluate(() => {
    const bar = document.querySelector(".you-switch");
    const on = document.querySelector('.you-switch-item[data-on="true"]');
    const chip = document.querySelector(".you-empty-chip");
    if (!bar || !on) return null;
    return {
      barBg: getComputedStyle(bar).backgroundColor,
      barRadius: parseFloat(getComputedStyle(bar).borderTopLeftRadius),
      onBg: getComputedStyle(on).backgroundColor,
      chip: chip ? getComputedStyle(chip).display : null,
    };
  });
  record(
    "screen.you.segmented-pill",
    Boolean(pill) && pill.barBg === "rgb(236, 236, 236)" && pill.barRadius >= 20 && pill.onBg === "rgb(17, 17, 17)",
    JSON.stringify(pill),
  );
  record("screen.you.empty-chip-phone", pill?.chip === "flex", String(pill?.chip));
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

/** The decorative hangtag chip is a phone-only element: hidden (display none) on tablet and desktop. */
async function screenYouEmptyChip(page, label) {
  await goto(page, "/login");
  await page.locator(".you-empty-chip").waitFor({ state: "attached", timeout: 8_000 });
  const display = await page.evaluate(() => {
    const chip = document.querySelector(".you-empty-chip");
    return chip ? getComputedStyle(chip).display : null;
  });
  record(`screen.you.empty-chip-${label}`, display === "none", String(display));
}

const CREATED_LOOK = {
  ...DRAFT,
  title: "Four pins",
  tags: [
    { id: "pin-style", x: 48, y: 40, name: "Wool Coat", brand: "", price: "", currency: "EUR", url: "", retailerId: "", offers: [], styleId: "style-noir-column" },
    { id: "pin-b", x: 50, y: 70, name: "Wide Trouser", brand: "", price: "", currency: "EUR", url: "https://www.zalando.de/weekday-wide-trouser-black-we121a0aa-q11.html", retailerId: "zalando", offers: [] },
    { id: "pin-c", x: 40, y: 24, name: "Leather Boot", brand: "", price: "", currency: "EUR", url: "https://www.zalando.de/dr-martens-leather-boot-black-dr211b00j-q11.html", retailerId: "zalando", offers: [] },
    { id: "pin-d", x: 62, y: 16, name: "Knit Scarf", brand: "", price: "", currency: "EUR", url: "https://www.zalando.de/pieces-knit-scarf-beige-pe351g0k2-b11.html", retailerId: "zalando", offers: [] },
  ],
};

/** Publishes a four-pin look with a Style-linked pin that has no offers, then checks every placement of the pin card. */
async function flowPinCardClear(page) {
  const stamp = `pc${Date.now().toString(36)}`;
  await goto(page, `/login?next=${encodeURIComponent("/create")}`);
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.locator("#creator-name").fill("Pin Tester");
  await page.locator("#creator-handle").fill(`pc${stamp.slice(-6)}`);
  await page.locator("#creator-city").fill("Berlin");
  await page.locator("#creator-email").fill(`${stamp}@looktag.test`);
  await page.locator("#creator-password").fill("looktag-e2e-pass-1");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.evaluate(
    ({ key, raw }) => sessionStorage.setItem(key, raw),
    { key: CREATE_DRAFT_KEY, raw: JSON.stringify({ ...CREATED_LOOK, id: `ui-${stamp}` }) },
  );
  await goto(page, "/create");
  await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
  if ((await page.locator(".look-studio").getAttribute("data-step")) === "pins") {
    await page.getByRole("button", { name: "Done" }).first().click();
    await page.locator("#create-title").fill("Four pins");
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForURL(/\/looks\//, { timeout: 15_000 }).catch(async (error) => {
    console.log("PUBLISH-STUCK", page.url(), await page.locator("[data-sonner-toast], [role=status], [role=alert]").allInnerTexts());
    throw error;
  });
  const path = new URL(page.url()).pathname;
  record("flow.pins4.published", /\/looks\//.test(path), path);

  async function pinsClear(label) {
    await goto(page, path);
    await page.locator(".look-plate .tag-pin").first().waitFor({ timeout: 10_000 });
    const card = page.getByRole("dialog", { name: "Selected piece" });
    const rows = [];
    for (let index = 0; index < 4; index += 1) {
      await page.locator(".look-plate .tag-pin").nth(index).click();
      await card.waitFor({ timeout: 4_000 });
      await page.waitForTimeout(350);
      rows.push(
        await page.evaluate((selected) => {
          const plate = document.querySelector(".look-plate").getBoundingClientRect();
          const cardRect = document.querySelector('[role="dialog"]').getBoundingClientRect();
          const pins = [...document.querySelectorAll(".look-plate .tag-pin")].map((node, i) => {
            const r = node.getBoundingClientRect();
            return { i, x: r.left + r.width / 2, y: r.top + r.height / 2 };
          });
          const hidden = pins
            .filter((pin) => pin.x > cardRect.left - 8 && pin.x < cardRect.right + 8 && pin.y > cardRect.top - 8 && pin.y < cardRect.bottom + 8)
            .map((pin) => pin.i + 1);
          const inside = cardRect.left >= plate.left && cardRect.right <= plate.right && cardRect.top >= plate.top && cardRect.bottom <= plate.bottom;
          return { selected: selected + 1, hidden, inside };
        }, index),
      );
    }
    record(
      `flow.pins4.card-clear-${label}`,
      rows.every((row) => row.hidden.length === 0 && row.inside),
      JSON.stringify(rows),
    );
  }

  await pinsClear("phone");
  // Style-linked pin with no offers: Style name, House, View Style only. No "No close match yet", no Shop.
  await page.locator(".look-plate .tag-pin").nth(0).click();
  const card = page.getByRole("dialog", { name: "Selected piece" });
  await card.getByRole("link", { name: "View Style" }).waitFor({ timeout: 6_000 });
  const text = (await card.innerText()).replace(/\s+/g, " ");
  record(
    "flow.look.style-no-offers",
    /Column Dress/.test(text) &&
      /Atelier Noir/.test(text) &&
      !/Wool Coat/.test(text) &&
      !/No close match yet/.test(text) &&
      (await card.getByRole("button", { name: /Shop/ }).count()) === 0,
    text,
  );

  await page.setViewportSize({ width: 834, height: 1112 });
  await pinsClear("tablet");

  // Desktop panel: Style-linked row, and Shop whole look opens a single window.
  await page.setViewportSize({ width: 1280, height: 800 });
  await goto(page, path);
  await page.locator(".wide-prow .style-view-ghost").first().waitFor({ timeout: 10_000 });
  const row = await page.evaluate(() => {
    const first = document.querySelector(".wide-prow");
    const view = first.querySelector(".style-view-ghost");
    return {
      title: first.querySelector(".wide-pnm")?.textContent,
      sub: first.querySelector(".wide-prt")?.textContent,
      viewH: view ? Math.round(view.getBoundingClientRect().height) : null,
      shop: Boolean([...first.querySelectorAll("button")].find((b) => /^Shop/.test(b.getAttribute("aria-label") || ""))),
      underlined: Boolean(first.querySelector(".style-pin, .style-pin-view")),
    };
  });
  record(
    "flow.desktop.style-row",
    row.title === "Column Dress" && row.sub === "Atelier Noir" && row.viewH === 44 && !row.shop && !row.underlined,
    JSON.stringify(row),
  );
  // Count window.open calls: a stalled external popup may never raise a context "page" event.
  await page.evaluate(() => {
    window.__opens = [];
    const real = window.open.bind(window);
    window.open = (...args) => {
      window.__opens.push(String(args[0]));
      return real(...args);
    };
  });
  await page.getByRole("button", { name: "Shop whole look" }).click();
  await page.waitForTimeout(1500);
  const opens = await page.evaluate(() => window.__opens);
  record(
    "flow.desktop.shop-whole-one-window",
    opens.length === 1 && /zalando\.de\/weekday-wide-trouser/.test(opens[0]),
    JSON.stringify(opens),
  );
  for (const popup of page.context().pages().slice(1)) await popup.close().catch(() => undefined);
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
  await page.getByRole("link", { name: "View Style" }).first().waitFor({ timeout: 8_000 }).catch(() => undefined);
  const lookText = await page.locator("body").innerText();
  record("screen.desktop.look", /Shop this look/.test(lookText) && !/\$/.test(lookText), lookText.slice(0, 180));
  record(
    "screen.desktop.style-pin",
    /View Style/.test(lookText) && /Column Dress/.test(lookText) && !/\$/.test(lookText),
    lookText.slice(0, 240),
  );
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 8_000 });
  const housesText = await page.locator("body").innerText();
  record("screen.desktop.houses", /Scouted/.test(housesText) && /this week's drop/i.test(housesText), housesText.slice(0, 180));
  const indexCols = await page.evaluate(() => getComputedStyle(document.querySelector(".house-index-grid")).gridTemplateColumns.split(" ").length);
  record("screen.desktop.houses-cols", indexCols === 4, String(indexCols));
  await goto(page, "/houses/label-atelier-noir");
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  record("screen.desktop.house-hero-row", ...(await heroRow(page, { coverW: 215, linesCols: 4, followMax: 640 })));
  await screenYouEmptyChip(page, "desktop");
  await goto(page, "/rank");
  record("screen.rank", (await page.locator("body").innerText()).length > 20);
}

async function heroRow(page, { coverW, linesCols, followMax }) {
  const m = await page.evaluate(() => {
    const r = (sel) => {
      const b = document.querySelector(sel)?.getBoundingClientRect();
      return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) } : null;
    };
    const lines = document.querySelector(".house-profile-lines .house-lines");
    return {
      cover: r(".house-hero"),
      info: r(".house-profile-info"),
      follow: r(".house-profile .house-follow"),
      lines: r(".house-profile-lines .house-lines"),
      cols: lines ? getComputedStyle(lines).gridTemplateColumns.split(" ").length : 0,
      sticky: getComputedStyle(document.querySelector(".house-profile-hero")).position === "sticky",
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const ok =
    Boolean(m.cover && m.info && m.lines) &&
    Math.abs(m.cover.w - coverW) <= 3 &&
    Math.abs(m.cover.h / m.cover.w - 4 / 3) < 0.02 &&
    m.info.x >= m.cover.right &&
    m.lines.y >= m.cover.bottom &&
    m.lines.x === m.cover.x &&
    m.cols === linesCols &&
    m.follow.bottom <= followMax &&
    !m.sticky &&
    !m.overflow;
  return [ok, JSON.stringify(m)];
}

async function screenHousesTablet(page) {
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 10_000 });
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".house-index-grid")).gridTemplateColumns.split(" ").length);
  record("screen.tablet.houses-cols", cols === 2, String(cols));
  await goto(page, "/houses/label-atelier-noir");
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  record("screen.tablet.house-hero-row", ...(await heroRow(page, { coverW: 352, linesCols: 2, followMax: 1000 })));
}

async function screenHouses1024(page) {
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 10_000 });
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".house-index-grid")).gridTemplateColumns.split(" ").length);
  record("screen.1024.houses-cols", cols === 3, String(cols));
  await goto(page, "/houses/label-atelier-noir");
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  record("screen.1024.house-hero-row", ...(await heroRow(page, { coverW: 215, linesCols: 3, followMax: 640 })));
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
    await screenHousesTablet(page);
    await screenYouEmptyChip(page, "tablet");
  }, "ui-tablet", { viewport: { width: 834, height: 1112 } });

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenHouses1024(page);
  }, "ui-1024", { viewport: { width: 1024, height: 768 } });

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowPinCardClear(page);
  }, "ui-pins", phone);

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowSignedInEdit(page);
  }, "ui-edit", { viewport: { width: 390, height: 844 } });

  await withPage(browser, origin, async (page) => {
    await prime(page, { draft: true });
    await goto(page, "/create");
    await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
    const deskDone = await page.evaluate(() => {
      const done = document.querySelector(".create-pin-actions .create-btn-done");
      const add = document.querySelector(".create-pin-actions .create-btn-pin");
      const back = document.querySelector(".create-plate-back");
      if (!done || !add || !back) return null;
      const style = getComputedStyle(done);
      return {
        height: Math.round(done.getBoundingClientRect().height),
        width: Math.round(done.getBoundingClientRect().width),
        addWidth: Math.round(add.getBoundingClientRect().width),
        border: style.borderTopWidth,
        borderColor: style.borderTopColor,
        backBorderColor: getComputedStyle(back).borderTopColor,
        color: style.color,
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
      };
    });
    record(
      "flow.desktop.done-ghost",
      deskDone?.height === 44 &&
        deskDone.border === "1px" &&
        deskDone.radius === "12px" &&
        deskDone.background === "rgb(255, 255, 255)" &&
        deskDone.color === "rgb(17, 17, 17)" &&
        deskDone.borderColor === deskDone.backBorderColor &&
        Math.abs(deskDone.width - deskDone.addWidth) <= 1,
      JSON.stringify(deskDone),
    );
    const deskAdd = await page.evaluate(() => {
      const done = document.querySelector(".create-pin-actions .create-btn-done");
      const add = document.querySelector(".create-pin-actions .create-btn-pin");
      const hint = document.querySelector(".create-pin-hint");
      const find = document.querySelector(".create-find");
      if (!done || !add || !hint || !find) return null;
      const rgb = (c, over = [255, 255, 255]) => {
        const n = (c.match(/[\d.]+/g) || []).map(Number);
        const alpha = n.length > 3 ? n[3] : 1;
        return [0, 1, 2].map((i) => n[i] * alpha + over[i] * (1 - alpha));
      };
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const contrast = (fg, bg) => {
        const a = lum(rgb(fg));
        const b = lum(rgb(bg));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const card = getComputedStyle(document.querySelector(".create-pin-dock")).backgroundColor;
      const a = getComputedStyle(add);
      const ar = add.getBoundingClientRect();
      const dr = done.getBoundingClientRect();
      return {
        bg: a.backgroundColor,
        color: a.color,
        height: Math.round(ar.height),
        width: Math.round(ar.width),
        doneWidth: Math.round(dr.width),
        doneHeight: Math.round(dr.height),
        radius: a.borderTopLeftRadius,
        card,
        addContrast: Math.round(contrast(a.color, a.backgroundColor) * 10) / 10,
        hintContrast: Math.round(contrast(getComputedStyle(hint).color, card) * 10) / 10,
        findContrast: Math.round(contrast(getComputedStyle(find).color, card) * 10) / 10,
      };
    });
    record(
      "flow.desktop.add-pin-primary",
      deskAdd?.bg === "rgb(17, 17, 17)" &&
        deskAdd.addContrast >= 12 &&
        deskAdd.height === 44 &&
        deskAdd.doneHeight === 44 &&
        deskAdd.radius === "12px" &&
        Math.abs(deskAdd.width - deskAdd.doneWidth) <= 1,
      JSON.stringify(deskAdd),
    );
    record(
      "flow.desktop.pin-dock-text-legible",
      deskAdd && deskAdd.card === "rgb(255, 255, 255)" && deskAdd.hintContrast >= 4.5 && deskAdd.findContrast >= 4.5,
      JSON.stringify(deskAdd),
    );
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
