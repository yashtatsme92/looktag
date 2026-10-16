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

function hasNoPriceCopy(text) {
  return !/[€$£]|\bcheapest\b|\bfrom\b/i.test(text);
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
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  record("screen.home.meta-no-cheapest", !/\bcheapest\b/i.test(description ?? ""), description ?? "");
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

/** Phone Home: the lead slide carries the Save, Echo and Share ghost row above the tab bar. */
async function flowHomeActionRow(page) {
  await goto(page, "/");
  await page.locator(".echo-snap").waitFor({ timeout: 10_000 });
  const row = page.locator(".echo-plate").first().locator(".echo-actions");
  await row.waitFor({ timeout: 10_000 });
  const names = ["Save", "Echo", "Share"];
  const boxes = [];
  for (const name of names) {
    const button = row.getByRole("button", { name, exact: true });
    boxes.push(await button.boundingBox());
  }
  const navTop = await page.evaluate(() => document.querySelector('nav[aria-label="App"]').getBoundingClientRect().top);
  record(
    "flow.home.actions.boxes",
    boxes.every((b) => b && Math.round(b.width) === 44 && Math.round(b.height) === 44 && b.y + b.height <= navTop),
    JSON.stringify(boxes),
  );
  record(
    "flow.home.actions.gap",
    boxes.every((b, i) => i === 0 || Math.round(b.x - (boxes[i - 1].x + boxes[i - 1].width)) === 8),
  );
  const bg = await row.getByRole("button", { name: "Echo", exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  record("flow.home.actions.ghost", bg === "rgba(0, 0, 0, 0)", bg);
  await row.getByRole("button", { name: "Echo", exact: true }).click();
  const kicker = await page.getByText("More like this", { exact: false }).first().waitFor({ timeout: 5_000 }).then(() => true, () => false);
  record("flow.home.actions.echo", kicker);
}

/** Wider layouts keep WideHome: the phone action row is not visible. */
async function flowHomeActionRowHidden(page, label) {
  await goto(page, "/");
  await page.waitForTimeout(1500);
  const visible = await page.evaluate(() =>
    [...document.querySelectorAll(".echo-actions")].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }),
  );
  record(`flow.home.actions.hidden.${label}`, !visible);
}

/** Reduced motion: the action buttons have no transform transition. */
async function flowHomeActionRowReducedMotion(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await goto(page, "/");
  const button = page.locator(".echo-plate").first().locator(".echo-actions").getByRole("button", { name: "Echo", exact: true });
  await button.waitFor({ timeout: 10_000 });
  const duration = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
  record("flow.home.actions.reduced-motion", /^0s(, 0s)*$/.test(duration), duration);
}

/** Phone look detail keeps the 4-tab bar: the photo is full-bleed and ends where the bar starts. */
async function screenLookTabbar(page) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.locator(".look-plate").waitFor({ timeout: 10_000 });
  const read = () =>
    page.evaluate(() => {
      const box = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, display: getComputedStyle(el).display };
      };
      return {
        tab: box(".tab-bar"),
        plate: box(".look-plate"),
        card: box(".look-plate-piece"),
        echo: box(".look-plate-echo"),
        items: [...document.querySelectorAll(".tab-bar .tab-item")].map((el) => el.textContent?.trim()),
        vh: window.innerHeight,
      };
    });
  const m = await read();
  record(
    "screen.look.tabbar",
    Boolean(m.tab && m.plate) &&
      m.tab.display !== "none" &&
      m.tab.height >= 72 &&
      m.items.length === 4 &&
      m.plate.top <= 1 &&
      Math.abs(m.plate.bottom - m.tab.top) <= 1 &&
      Math.abs(m.tab.bottom - m.vh) <= 1 &&
      m.echo.bottom <= m.tab.top,
    JSON.stringify(m),
  );
  await page.locator(".look-plate .tag-pin").nth(0).click();
  await page.getByRole("dialog", { name: "Selected piece" }).waitFor({ timeout: 4_000 });
  await page.waitForTimeout(350);
  const s = await read();
  record(
    "screen.look.tabbar-spotlight",
    Boolean(s.card && s.tab) && s.card.bottom <= s.tab.top && s.card.top >= 0 && s.tab.display !== "none",
    JSON.stringify(s),
  );
  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: /Houses/ }).click();
  await page.waitForFunction(() => location.pathname === "/houses", null, { timeout: 8_000 });
  record("screen.look.tabbar-nav", new URL(page.url()).pathname === "/houses");
}

/** `Shop this look` sheet (Look/3): slides up above the always-visible tab bar, one Shop per piece, no prices. */
async function flowLookShopSheet(page) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.locator(".look-plate-shop").click();
  const sheet = page.getByRole("dialog", { name: "Shop this look" });
  await sheet.waitFor({ timeout: 4_000 });
  await page.getByRole("link", { name: "View Style" }).first().waitFor({ timeout: 6_000 });
  await page.waitForTimeout(450);
  const sheetText = await sheet.innerText();
  record("flow.look.shop-sheet-no-price-copy", hasNoPriceCopy(sheetText), sheetText.replace(/\s+/g, " "));
  const m = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const tab = box(".tab-bar");
    const hit = tab ? document.elementFromPoint((tab.left + tab.right) / 2, (tab.top + tab.bottom) / 2) : null;
    const whole = document.querySelector(".look-sheet-whole");
    const wholeCs = whole ? getComputedStyle(whole) : null;
    return {
      sheet: box(".look-sheet"),
      tab,
      tabVisible: Boolean(hit?.closest(".tab-bar")),
      rows: document.querySelectorAll(".look-sheet-row").length,
      shops: document.querySelectorAll(".look-sheet-shop").length,
      wholeH: whole ? Math.round(whole.getBoundingClientRect().height) : null,
      wholeBg: wholeCs?.backgroundColor,
      wholeBorder: wholeCs?.borderTopWidth,
      text: document.querySelector(".look-sheet")?.textContent ?? "",
    };
  });
  record(
    "flow.look.shop-sheet",
    Boolean(m.sheet && m.tab) &&
      Math.abs(m.sheet.bottom - m.tab.top) <= 1 &&
      m.tabVisible &&
      m.rows === 4 &&
      m.shops === 4 &&
      hasNoPriceCopy(m.text),
    JSON.stringify({ ...m, text: undefined }),
  );
  const styleRow = (await page.locator(".look-sheet-row").first().innerText()).replace(/\s+/g, " ");
  record(
    "flow.look.shop-sheet-style-row",
    /Column Dress/.test(styleRow) && /Atelier Noir/.test(styleRow) && /View Style/.test(styleRow) && !/Oversized Wool Coat/.test(styleRow),
    styleRow,
  );
  record(
    "flow.look.shop-sheet-whole-ghost",
    m.wholeH === 44 && m.wholeBorder === "1px" && m.wholeBg === "rgba(0, 0, 0, 0)",
    JSON.stringify({ h: m.wholeH, bg: m.wholeBg, border: m.wholeBorder }),
  );
  await page.evaluate(() => {
    window.__opens = [];
    window.open = (...args) => {
      window.__opens.push(String(args[0]));
      return {};
    };
  });
  await page.locator(".look-sheet-whole").click();
  const opens = await page.evaluate(() => window.__opens);
  record("flow.look.shop-sheet-whole-one", opens.length === 1, JSON.stringify(opens));
  // Dialog semantics: modal, focus inside, Tab cycles inside the sheet.
  const modal = await sheet.getAttribute("aria-modal");
  const focusedInside = await page.evaluate(() => document.activeElement?.closest(".look-sheet") !== null);
  const tabbed = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press("Tab");
    tabbed.push(await page.evaluate(() => document.activeElement?.closest(".look-sheet") !== null));
  }
  await page.keyboard.press("Shift+Tab");
  const shiftInside = await page.evaluate(() => document.activeElement?.closest(".look-sheet") !== null);
  record(
    "flow.look.shop-sheet-focus-trap",
    modal === "true" && focusedInside && tabbed.every(Boolean) && shiftInside,
    JSON.stringify({ modal, focusedInside, tabbed: tabbed.filter((x) => !x).length, shiftInside }),
  );
  await page.keyboard.press("Escape");
  const closedByEsc = (await sheet.count()) === 0;
  const openerFocused = await page
    .waitForFunction(() => document.activeElement?.classList.contains("look-plate-shop") ?? false, null, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  const activeAfter = await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
  record("flow.look.shop-sheet-focus-return", closedByEsc && openerFocused, String(activeAfter));
  await page.locator(".look-plate-shop").click();
  await sheet.waitFor({ timeout: 4_000 });
  await page.mouse.click(195, 60);
  record("flow.look.shop-sheet-dismiss", closedByEsc && (await sheet.count()) === 0, `esc=${closedByEsc}`);
}

/** Tablet: the Shop sheet is centred and about 600px wide; Esc with the account sheet open keeps the pin card. */
async function flowLookShopSheetTablet(page) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.locator(".look-plate-shop").click();
  const sheet = page.getByRole("dialog", { name: "Shop this look" });
  await sheet.waitFor({ timeout: 4_000 });
  await page.waitForTimeout(450);
  const m = await page.evaluate(() => {
    const r = document.querySelector(".look-sheet").getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth };
  });
  record(
    "flow.look.shop-sheet-tablet-width",
    m.width >= 560 && m.width <= 604 && Math.abs(m.left - (m.vw - m.right)) <= 1,
    JSON.stringify(m),
  );
  const sheetText = await sheet.innerText();
  record("flow.look.shop-sheet-tablet-no-price-copy", hasNoPriceCopy(sheetText), sheetText.replace(/\s+/g, " "));
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);
  record("flow.look.shop-sheet-tablet-esc", (await sheet.count()) === 0);
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
    /Cashmere Turtleneck/.test(cardText) &&
      /Uniqlo/.test(cardText) &&
      /Shop/.test(cardText) &&
      hasNoPriceCopy(cardText),
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
  const laneLabel = page.locator(".echo-lane-label");
  await laneLabel.waitFor({ timeout: 4_000 });
  const laneLabelStyle = await laneLabel.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      padding: style.padding,
      shadow: style.boxShadow,
    };
  });
  record(
    "flow.look.echo-lane-label-not-chip",
    laneLabelStyle.background === "rgba(0, 0, 0, 0)" &&
      laneLabelStyle.borderRadius === "0px" &&
      laneLabelStyle.padding === "0px" &&
      laneLabelStyle.shadow === "none",
    JSON.stringify(laneLabelStyle),
  );
}

/** Esc closes the account sheet and leaves the pin card (and its place on the plate) alone. */
async function flowEscAccountSheet(page, label) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.getByRole("heading", { name: "Sunday Coat" }).waitFor({ timeout: 10_000 });
  await page.locator(".look-plate .tag-pin").nth(1).click();
  const card = page.getByRole("dialog", { name: "Selected piece" });
  await card.waitFor({ timeout: 4_000 });
  await page.getByRole("button", { name: "Save look" }).click();
  const sheet = page.locator("[data-vaul-drawer]");
  await sheet.waitFor({ timeout: 5_000 });
  await page.keyboard.press("Escape");
  const sheetClosed = await page
    .waitForFunction(() => document.querySelectorAll("[data-vaul-drawer]").length === 0, null, { timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  record(`flow.look.esc-account-sheet-${label}`, sheetClosed && (await card.count()) === 1, `sheetClosed=${sheetClosed} card=${await card.count()}`);
}

/** For every pin on the seed look: select it and check the card hides neither that pin nor any other. */
async function flowSelectedPinClear(page, label) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.getByRole("heading", { name: "Sunday Coat" }).waitFor({ timeout: 10_000 });
  const total = await page.locator(".look-plate .tag-pin").count();
  const rows = [];
  for (let i = 0; i < total; i += 1) {
    await page.locator(".look-plate .tag-pin").nth(i).evaluate((node) => node.click());
    await page.getByRole("dialog", { name: "Selected piece" }).waitFor({ timeout: 4_000 });
    await waitForPinCardPlacement(page);
    rows.push(
      await page.evaluate((index) => {
        const card = document.querySelector(".look-plate-piece").getBoundingClientRect();
        const plate = document.querySelector(".look-plate").getBoundingClientRect();
        return [...document.querySelectorAll(".look-plate .tag-pin")].map((pin, j) => {
          const r = pin.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const onPlate = cx > plate.left && cx < plate.right && cy > plate.top && cy < plate.bottom;
          const covered = onPlate && cx > card.left - 16 && cx < card.right + 16 && cy > card.top - 16 && cy < card.bottom + 16;
          return { pin: j, selected: j === index, onPlate, covered };
        });
      }, i),
    );
  }
  const selectedHidden = rows.flatMap((row) => row.filter((p) => p.selected && p.covered));
  const anyHidden = rows.flatMap((row) => row.filter((p) => p.covered));
  record(`flow.look.pin-card-selected-clear-${label}`, total >= 4 && selectedHidden.length === 0, JSON.stringify(selectedHidden));
  record(`flow.look.pin-card-no-pin-covered-${label}`, anyHidden.length === 0, JSON.stringify(anyHidden));
}

async function waitForPinCardPlacement(page) {
  await page.waitForFunction(
    () => {
      const card = document.querySelector(".look-plate-piece");
      const plate = document.querySelector(".look-plate");
      return Boolean(
        card &&
          plate &&
          card.style.top &&
          (plate.clientWidth < 768 || card.style.left) &&
          card.getAnimations().every((animation) => animation.playState === "finished"),
      );
    },
    null,
    { timeout: 3_000 },
  );
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
  let releaseImage;
  const imageGate = new Promise((resolve) => {
    releaseImage = resolve;
  });
  await page.route("**/looks/sunday-coat.jpg", async (route) => {
    await imageGate;
    await route.continue();
  });
  await goto(page, "/create");
  await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
  await page.getByRole("heading", { name: "Crop" }).waitFor({ timeout: 5_000 });
  await page.waitForFunction(
    () => document.querySelector(".crop-stage")?.getAttribute("aria-busy") === "true",
    null,
    { timeout: 5_000 },
  );
  const loading = await page.evaluate(() => ({
    busy: document.querySelector(".crop-stage")?.getAttribute("aria-busy"),
    frameCount: document.querySelectorAll(".crop-frame").length,
    useDisabled: document.querySelector(".crop-use")?.disabled,
    skipDisabled: document.querySelector(".crop-skip")?.disabled,
    changeDisabled: document.querySelector(".crop-change")?.disabled,
    loadingText: document.querySelector('[role="status"]')?.textContent?.trim(),
    underlayHidden: getComputedStyle(document.querySelector(".crop-stage-underlay")).visibility === "hidden",
  }));
  record(
    "flow.create.crop-loading-gate",
    loading.busy === "true" &&
      loading.frameCount === 0 &&
      loading.useDisabled &&
      loading.skipDisabled &&
      loading.changeDisabled === false &&
      loading.loadingText === "Loading photo" &&
      loading.underlayHidden,
    JSON.stringify(loading),
  );
  releaseImage();
  await page.locator(".crop-frame").waitFor({ timeout: 8_000 });
  record(
    "flow.create.crop-controls",
    (await page.locator('.crop-zoom-slider[aria-label="Zoom"]').getAttribute("aria-valuetext")) === "Zoom, 1×" &&
      (await page.getByRole("button", { name: "Use photo" }).isEnabled()),
  );
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForFunction(() => document.querySelector(".look-studio")?.getAttribute("data-step") === "pins");
  record("flow.create.pins", (await page.locator(".look-studio").getAttribute("data-step")) === "pins");
  await page.locator(".create-plate-back").click();
  record("flow.create.pin-back-to-crop", (await page.locator(".look-studio").getAttribute("data-step")) === "crop");
  await page.getByRole("button", { name: "Use photo" }).click();
  await page.waitForFunction(() => document.querySelector(".look-studio")?.getAttribute("data-step") === "pins");
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
  await page.getByRole("button", { name: "Edit crop" }).click();
  await page.getByRole("heading", { name: "Edit crop" }).waitFor({ timeout: 5_000 });
  await page.locator(".crop-frame").waitFor({ timeout: 8_000 });
  const editCropPins = await page.evaluate(() => {
    const stage = document.querySelector(".crop-stage")?.getBoundingClientRect();
    const markers = [...document.querySelectorAll(".crop-pin-marker")].map((marker) => {
      const rect = marker.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        opacity: getComputedStyle(marker).opacity,
      };
    });
    return {
      stage: stage && { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
      markers,
    };
  });
  record(
    "flow.crop.edit-pins-visible",
    Boolean(
      editCropPins.stage &&
        editCropPins.markers.length > 0 &&
        editCropPins.markers.every(
          (marker) =>
            marker.right - marker.left >= 20 &&
            marker.bottom - marker.top >= 20 &&
            marker.left >= editCropPins.stage.left &&
            marker.top >= editCropPins.stage.top &&
            marker.right <= editCropPins.stage.right &&
            marker.bottom <= editCropPins.stage.bottom,
        ),
    ),
    JSON.stringify(editCropPins),
  );
  await page.getByRole("button", { name: "Cancel" }).click();
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

async function screenCropLayout(page, label) {
  await goto(page, "/create");
  await page.getByRole("heading", { name: "Crop" }).waitFor({ timeout: 8_000 });
  await page.locator(".crop-frame").waitFor({ timeout: 8_000 });
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null;
    };
    const step = document.querySelector(".create-crop-step");
    return {
      frame: rect(".crop-frame"),
      controls: rect(".crop-controls"),
      actions: rect(".crop-actions"),
      columns: getComputedStyle(step).gridTemplateColumns,
      busy: document.querySelector(".crop-stage")?.getAttribute("aria-busy"),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const desktop = page.viewportSize().width >= 1024;
  const layoutOk = geometry.frame && geometry.controls && (
    desktop
      ? geometry.controls.x >= geometry.frame.right && geometry.columns.split(" ").length === 2
      : geometry.controls.width <= 600 && geometry.controls.y >= geometry.frame.bottom - 1
  );
  record(`flow.crop.layout-${label}`, Boolean(layoutOk && geometry.busy === "false" && !geometry.overflow), JSON.stringify(geometry));
  record(
    `flow.crop.actions-${label}`,
    (await page.getByRole("button", { name: "Change photo" }).isEnabled()) &&
      (await page.getByRole("button", { name: "Use photo" }).isEnabled()) &&
      (await page.getByRole("button", { name: "Skip" }).isEnabled()),
  );
}

async function screenHouses(page) {
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 10_000 });
  const text = await page.locator("body").innerText();
  record("screen.houses.scouted", /Scouted/.test(text) && /Atelier Noir/.test(text) && /Picked by Looktag/.test(text), text.slice(0, 180));
  record("screen.houses.more", /More houses/.test(text));
  await recordScoutedDropAfterFirstRow(page, "screen.phone.houses.drop-after-first-row", 2);
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

async function recordScoutedDropAfterFirstRow(page, name, expectedColumns) {
  const state = await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby="houses-scouted"]');
    const layouts = [...(section?.querySelectorAll(":scope > .houses-scouted-layout") ?? [])];
    const layout = layouts.find((node) => getComputedStyle(node).display !== "none");
    const drop = layout?.querySelector(":scope > .house-drop");
    const grids = [...(layout?.querySelectorAll(":scope > .house-index-grid") ?? [])];
    const firstGrid = grids[0];
    const columns = firstGrid ? getComputedStyle(firstGrid).gridTemplateColumns.split(" ").length : 0;
    const totalHouses = grids.reduce((count, grid) => count + grid.querySelectorAll(".house-card").length, 0);
    const firstCount = firstGrid?.querySelectorAll(".house-card").length ?? 0;
    const firstBottom = firstGrid?.getBoundingClientRect().bottom ?? 0;
    const dropTop = drop?.getBoundingClientRect().top ?? 0;
    const dropBottom = drop?.getBoundingClientRect().bottom ?? 0;
    const dropStyle = drop ? getComputedStyle(drop) : null;
    const followsFirstGrid = Boolean(
      firstGrid && drop && firstGrid.compareDocumentPosition(drop) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const remainingGridFollowsDrop = Boolean(
      drop &&
        grids[1] &&
        drop.compareDocumentPosition(grids[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    return {
      hasDropInScouted: Boolean(section && layout?.parentElement === section && drop?.parentElement === layout),
      columns,
      totalHouses,
      firstCount,
      gap: dropTop - firstBottom,
      dropMarginTop: dropStyle ? parseFloat(dropStyle.marginTop) : 0,
      dropMarginBottom: dropStyle ? parseFloat(dropStyle.marginBottom) : 0,
      remainingGap: grids[1] ? grids[1].getBoundingClientRect().top - dropBottom : null,
      followsFirstGrid,
      hasRemainingGrid: Boolean(grids[1]),
      remainingGridFollowsDrop,
      remainingCount: grids[1]?.querySelectorAll(".house-card").length ?? 0,
    };
  });
  const firstRowCount = Math.min(expectedColumns, state.totalHouses);
  record(
    name,
    state.hasDropInScouted &&
      state.columns === expectedColumns &&
      state.firstCount === firstRowCount &&
      state.followsFirstGrid &&
      state.gap >= 32 &&
      state.dropMarginTop === 32 &&
      state.dropMarginBottom === 32 &&
      (state.totalHouses <= expectedColumns
        ? !state.hasRemainingGrid
        : state.hasRemainingGrid &&
          state.remainingGridFollowsDrop &&
          state.remainingGap >= 32 &&
          state.remainingCount === state.totalHouses - expectedColumns),
    JSON.stringify(state),
  );
}

async function screenHousesWithoutScouted(page) {
  await page.route("**/_serverFn/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1) || "";
    const handler = Buffer.from(endpoint, "base64url").toString();
    if (handler.includes("listFashionLabels_createServerFn_handler")) {
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await goto(page, "/houses");
  await page.getByText("No houses yet.", { exact: true }).waitFor({ timeout: 10_000 });
  await page.getByRole("region", { name: "This week's drop" }).waitFor({ timeout: 8_000 });
  const state = await page.evaluate(() => {
    const drop = document.querySelector(".house-drop");
    const empty = [...document.querySelectorAll("p")].find((node) => node.textContent?.trim() === "No houses yet.");
    return {
      hasScouted: Boolean(document.querySelector("#houses-scouted")),
      dropBeforeEmpty: Boolean(drop && empty && drop.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  record("screen.houses.zero-scouted-drop", !state.hasScouted && state.dropBeforeEmpty, JSON.stringify(state));
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
  if ((await page.locator(".look-studio").getAttribute("data-step")) === "crop") {
    await page.locator(".crop-frame").waitFor({ timeout: 8_000 });
    await page.getByRole("button", { name: "Skip" }).click();
  }
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
  if ((await page.locator(".look-studio").getAttribute("data-step")) === "crop") {
    await page.locator(".crop-frame").waitFor({ timeout: 8_000 });
    await page.getByRole("button", { name: "Skip" }).click();
  }
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
      await waitForPinCardPlacement(page);
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
  // Shop whole look on the wide layouts (>=1024) opens the Shop sheet in place. Phone and the 834 tablet keep the LookPlate behaviour.
  for (const [name, width, height] of [["1024", 1024, 768], ["desktop", 1280, 800]]) {
    await page.setViewportSize({ width, height });
    await goto(page, path);
    await page.getByRole("button", { name: "Shop whole look" }).click();
    await page.locator(".look-sheet").waitFor({ timeout: 5000 });
    const sheet = await page.evaluate(() => {
      const dialog = document.querySelector(".look-sheet");
      const rows = [...dialog.querySelectorAll(".look-sheet-row")];
      return {
        path: location.pathname,
        nums: rows.map((r) => r.querySelector(".look-sheet-num")?.textContent),
        empty: rows.filter((r) => /No close match yet/.test(r.textContent) && !r.querySelector(".look-sheet-shop")).length,
        noShop: rows.filter((r) => !r.querySelector(".look-sheet-shop")).length,
        prices: /[€$£]|\d\s?EUR/.test(dialog.textContent),
        whole: Boolean(dialog.querySelector(".look-sheet-whole")),
      };
    });
    record(
      `flow.${name}.shop-whole-sheet`,
      sheet.path === path && sheet.nums.length > 0 && sheet.nums.every((n, i) => n === String(i + 1)) && !sheet.prices && !sheet.whole && sheet.empty === sheet.noShop,
      JSON.stringify(sheet),
    );
    await page.keyboard.press("Escape");
  }
  for (const popup of page.context().pages().slice(1)) await popup.close().catch(() => undefined);
}

/** Desktop look: a cover-cropped photo card that fits the viewport, with a top-left Back. */
async function screenDesktopLook(page) {
  await goto(page, "/looks/seed-sunday-coat");
  await page.locator(".wide-plate img").waitFor({ timeout: 10_000 });
  const m = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const plate = document.querySelector(".wide-plate");
    const img = plate.querySelector("img");
    const bar = document.querySelector(".web-header, .web-nav")?.getBoundingClientRect();
    const back = [...document.querySelectorAll(".wide-lookbar button")].find((b) => /Back/.test(b.textContent || ""));
    const panel = document.querySelector(".wide-panel");
    const pins = [...plate.querySelectorAll(".tag-pin")].map((p) => rect(p));
    const p = rect(plate);
    return {
      plate: p,
      img: rect(img),
      fit: getComputedStyle(img).objectFit,
      vh: window.innerHeight,
      barBottom: bar ? bar.bottom : 0,
      back: back ? rect(back) : null,
      backH: back ? Math.round(back.getBoundingClientRect().height) : null,
      panelH: Math.round(panel.getBoundingClientRect().height),
      pinCount: pins.length,
      pinsInside: pins.length > 0 && pins.every((r) => r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom),
    };
  });
  const shopText = await page.locator(".wide-panel").innerText();
  record("flow.desktop.look-no-price-copy", hasNoPriceCopy(shopText), shopText.replace(/\s+/g, " "));
  record(
    "screen.desktop.look-stored-crop",
    m.fit === "fill" &&
      m.img.width >= m.plate.width - 1 &&
      m.img.height >= m.plate.height - 1 &&
      m.img.left <= m.plate.left + 1 &&
      m.img.top <= m.plate.top + 1 &&
      m.plate.width > 480 &&
      m.plate.bottom <= m.vh &&
      m.plate.height <= m.vh - m.barBottom &&
      Math.abs(m.panelH - Math.round(m.plate.height)) <= 1 &&
      m.pinCount === 4 &&
      m.pinsInside,
    JSON.stringify(m),
  );
  await page.setViewportSize({ width: 1194, height: 834 });
  await goto(page, "/looks/seed-sunday-coat");
  await page.waitForFunction(
    () => {
      const image = document.querySelector(".wide-plate img");
      return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    },
    null,
    { timeout: 10_000 },
  );
  const portraitCrop = await page.evaluate(() => {
    const plate = document.querySelector(".wide-plate");
    const image = plate.querySelector("img");
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const imageRatio = width / height;
    const base = imageRatio > 3 / 4
      ? { x: (1 - (height * 3 / 4) / width) / 2, y: 0, w: (height * 3 / 4) / width, h: 1 }
      : { x: 0, y: (1 - (width * 4 / 3) / height) / 2, w: 1, h: (width * 4 / 3) / height };
    const plateRect = plate.getBoundingClientRect();
    const visibleWidth = Math.min(
      1,
      base.h * (plateRect.width / plateRect.height) * (height / width),
    );
    const expected = {
      x: Math.max(0, Math.min(1 - visibleWidth, base.x + base.w / 2 - visibleWidth / 2)),
      y: base.y,
      w: visibleWidth,
      h: base.h,
    };
    const actual = {
      x: -parseFloat(image.style.left) / parseFloat(image.style.width),
      y: -parseFloat(image.style.top) / parseFloat(image.style.height),
      w: 100 / parseFloat(image.style.width),
      h: 100 / parseFloat(image.style.height),
    };
    const seedPins = [[48, 38], [50, 26], [74, 52], [48, 88]];
    const expectedPinCount = seedPins.filter(([x, y]) =>
      x / 100 >= expected.x &&
      x / 100 <= expected.x + expected.w &&
      y / 100 >= expected.y &&
      y / 100 <= expected.y + expected.h,
    ).length;
    return {
      natural: { width, height },
      actual,
      expected,
      expectedPinCount,
      actualPinCount: plate.querySelectorAll(".tag-pin").length,
      headBandVisible: expected.y <= 0.1 && expected.y + expected.h > 0.1,
    };
  });
  record(
    "screen.desktop.crop-v-rect-1194",
    portraitCrop.natural.height > portraitCrop.natural.width &&
      portraitCrop.headBandVisible &&
      portraitCrop.expectedPinCount === portraitCrop.actualPinCount &&
      ["x", "y", "w", "h"].every((key) => Math.abs(portraitCrop.actual[key] - portraitCrop.expected[key]) < 0.002),
    JSON.stringify(portraitCrop),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  record(
    "screen.desktop.look-back",
    Boolean(m.back) && m.backH === 44 && m.back.left < m.plate.left + 8 && m.back.bottom <= m.plate.top,
    JSON.stringify({ back: m.back, plateTop: m.plate.top }),
  );
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForFunction(() => location.pathname === "/", null, { timeout: 8_000 });
  record("flow.desktop.look-back-nav", new URL(page.url()).pathname === "/");
  // At 1440x900 the card still ends inside the viewport.
  await page.setViewportSize({ width: 1440, height: 900 });
  await goto(page, "/looks/seed-sunday-coat");
  await page.locator(".wide-plate img").waitFor({ timeout: 10_000 });
  const big = await page.evaluate(() => ({
    bottom: document.querySelector(".wide-plate").getBoundingClientRect().bottom,
    vh: window.innerHeight,
  }));
  big.pins = await page.locator(".wide-plate .tag-pin").count();
  record("screen.desktop.look-cover-1440", big.bottom <= big.vh && big.pins === 4, JSON.stringify(big));
  const largePanelText = await page.locator(".wide-panel").innerText();
  record(
    "flow.desktop.look-no-price-copy-1440",
    hasNoPriceCopy(largePanelText),
    largePanelText.replace(/\s+/g, " "),
  );
  await page.setViewportSize({ width: 1194, height: 834 });
  const tabletPanelText = await page.locator(".wide-panel").innerText();
  record(
    "flow.desktop.look-no-price-copy-1194",
    hasNoPriceCopy(tabletPanelText),
    tabletPanelText.replace(/\s+/g, " "),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** Desktop panel rows: Shop left, View Style right, Style name and House on one line each at 1280, 1100 and 1024. */
async function screenDesktopStyleRow(page) {
  for (const [w, h] of [[1280, 800], [1100, 800], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await goto(page, "/looks/seed-sunday-coat");
    await page.locator(".wide-prow").first().waitFor({ timeout: 10_000 });
    await page.getByRole("link", { name: "View Style" }).first().waitFor({ timeout: 8_000 });
    const m = await page.evaluate(() => {
      const row = document.querySelector(".wide-prow");
      const name = row.querySelector(".wide-pnm");
      const house = row.querySelector(".wide-prt");
      const shop = row.querySelector("button.wide-btn-primary")?.getBoundingClientRect();
      const view = row.querySelector("a")?.getBoundingClientRect();
      const lh = (el) => parseFloat(getComputedStyle(el).lineHeight) || 20;
      return {
        nameText: name.textContent,
        nameLines: Math.round(name.getBoundingClientRect().height / lh(name)),
        houseLines: Math.round(house.getBoundingClientRect().height / lh(house)),
        truncated: name.scrollWidth > name.clientWidth,
        rowH: Math.round(row.getBoundingClientRect().height),
        shopLeft: shop && view ? shop.right <= view.left + 1 : false,
        shopH: shop ? Math.round(shop.height) : 0,
        viewH: view ? Math.round(view.height) : 0,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    record(
      `screen.desktop.style-row-${w}`,
      m.nameLines === 1 && m.houseLines === 1 && !m.truncated && m.shopLeft && m.shopH === 44 && m.viewH === 44 && !m.overflowX && m.rowH <= 130,
      JSON.stringify(m),
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await recordScoutedDropAfterFirstRow(page, "screen.desktop.houses.drop-after-first-row", 4);
  const indexCols = await page.evaluate(() => {
    const layout = [...document.querySelectorAll(".houses-scouted-layout")].find(
      (node) => getComputedStyle(node).display !== "none",
    );
    return getComputedStyle(layout.querySelector(".house-index-grid")).gridTemplateColumns.split(" ").length;
  });
  record("screen.desktop.houses-cols", indexCols === 4, String(indexCols));
  await page.setViewportSize({ width: 1100, height: 800 });
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 8_000 });
  await recordScoutedDropAfterFirstRow(page, "screen.1100.houses.drop-after-first-row", 3);
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await recordScoutedDropAfterFirstRow(page, "screen.tablet.houses.drop-after-first-row", 2);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".house-index-grid")).gridTemplateColumns.split(" ").length);
  record("screen.tablet.houses-cols", cols === 2, String(cols));
  await goto(page, "/houses/label-atelier-noir");
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  record("screen.tablet.house-hero-row", ...(await heroRow(page, { coverW: 352, linesCols: 2, followMax: 1000 })));
}

async function screenHouses1024(page) {
  await goto(page, "/houses");
  await page.getByRole("heading", { name: "Scouted", exact: true }).waitFor({ timeout: 10_000 });
  await recordScoutedDropAfterFirstRow(page, "screen.1024.houses.drop-after-first-row", 3);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".house-index-grid")).gridTemplateColumns.split(" ").length);
  record("screen.1024.houses-cols", cols === 3, String(cols));
  await goto(page, "/houses/label-atelier-noir");
  await page.getByRole("heading", { name: "Atelier Noir", exact: true }).waitFor({ timeout: 8_000 });
  record("screen.1024.house-hero-row", ...(await heroRow(page, { coverW: 215, linesCols: 3, followMax: 640 })));
}

const SAVE_BUTTON = /^Save( look)?$/;
const SAVED_KEY = "looktag-saved-v1";
const PENDING_SAVE_KEY = "looktag-pending-save-v1";

async function openSaveSheet(page) {
  const save = page.getByRole("button", { name: SAVE_BUTTON }).first();
  await save.waitFor({ timeout: 10_000 });
  const name = await save.getAttribute("aria-label");
  await save.click();
  await page.locator("[data-vaul-drawer]").waitFor({ timeout: 5_000 });
  return name;
}

const insideSheet = (page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest("[data-vaul-drawer]")));

/** The Save sheet traps focus, then returns it to Save on close. */
async function flowSaveSheetFocus(page, label, path) {
  await goto(page, path);
  const label0 = await openSaveSheet(page);
  const entered = await page
    .waitForFunction(() => Boolean(document.activeElement?.closest("[data-vaul-drawer]")), null, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  const tabbed = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    tabbed.push(await insideSheet(page));
  }
  await page.keyboard.press("Shift+Tab");
  const shiftInside = await insideSheet(page);
  record(
    `flow.save-sheet.focus-trap-${label}`,
    entered && tabbed.every(Boolean) && shiftInside,
    JSON.stringify({ entered, outside: tabbed.filter((x) => !x).length, shiftInside }),
  );
  await page.keyboard.press("Escape");
  const closed = await page
    .waitForFunction(() => document.querySelectorAll("[data-vaul-drawer]").length === 0, null, { timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  const returned = await page
    .waitForFunction((name) => document.activeElement?.getAttribute("aria-label") === name, label0, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  record(`flow.save-sheet.focus-return-${label}`, closed && returned, `closed=${closed} returned=${returned}`);
}

/** The sheet stays inside the viewport with Cancel fully visible, and nothing paints below it. */
async function flowSaveSheetPlacement(page, label, path) {
  await goto(page, path);
  await openSaveSheet(page);
  await page.waitForTimeout(700);
  const rect = await page.evaluate(() => {
    const sheet = document.querySelector("[data-vaul-drawer]");
    const overlay = document.querySelector("[data-vaul-overlay]");
    const cancel = [...sheet.querySelectorAll("button")].find((b) => /Cancel/.test(b.textContent ?? ""));
    const r = sheet.getBoundingClientRect();
    const c = cancel.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    return {
      vh: window.innerHeight,
      sheetTop: Math.round(r.top),
      sheetBottom: Math.round(r.bottom),
      cancelTop: Math.round(c.top),
      cancelBottom: Math.round(c.bottom),
      overlayTop: Math.round(o.top),
      overlayBottom: Math.round(o.bottom),
      scrollable: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
  record(
    `flow.save-sheet.placement-${label}`,
    rect.sheetTop >= 0 &&
      rect.sheetBottom <= rect.vh &&
      rect.cancelTop >= 0 &&
      rect.cancelBottom <= rect.vh &&
      rect.overlayTop === 0 &&
      rect.overlayBottom === rect.vh,
    JSON.stringify(rect),
  );
}

/** A guest taps Save, signs up, comes back to the same place, and the look is saved exactly once. */
async function flowSaveResume(page, label, path) {
  await goto(page, path);
  await openSaveSheet(page);
  await page.getByRole("link", { name: "Continue with email" }).click();
  await page.waitForURL(/\/login\?/, { timeout: 8_000 });
  const loginUrl = new URL(page.url());
  await page.getByText("Sign in to save", { exact: true }).waitFor({ timeout: 8_000 });
  record(
    `flow.save-resume.login-context-${label}`,
    loginUrl.searchParams.get("intent") === "save" && loginUrl.searchParams.get("next") === path,
    page.url(),
  );
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.locator("#creator-name").fill(`Saver ${stamp}`);
  await page.locator("#creator-email").fill(`saver-${stamp}@example.com`);
  await page.locator("#creator-password").fill("save-me-1234");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname + url.search === path, { timeout: 20_000 });
  const read = () =>
    page.evaluate(
      ([saved, pending]) => ({
        ids: JSON.parse(localStorage.getItem(saved) ?? "[]"),
        pending: sessionStorage.getItem(pending),
      }),
      [SAVED_KEY, PENDING_SAVE_KEY],
    );
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) ?? "[]").length > 0, SAVED_KEY, { timeout: 10_000 }).catch(() => {});
  const after = await read();
  await page.waitForTimeout(800);
  const later = await read();
  await goto(page, path);
  await page.waitForTimeout(800);
  const reloaded = await read();
  record(
    `flow.save-resume.saved-once-${label}`,
    after.ids.length === 1 &&
      later.ids.length === 1 &&
      reloaded.ids.length === 1 &&
      after.ids[0] === reloaded.ids[0] &&
      after.pending === null &&
      reloaded.pending === null,
    JSON.stringify({ after, later, reloaded }),
  );
}

const phone = { viewport: { width: 390, height: 844 } };
const desk = { viewport: { width: 1280, height: 800 } };

const browser = await chromium.launch({ headless: true });
try {
  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenHome(page);
    await flowHomeSnap(page);
    await flowHomeActionRow(page);
    await screenLook(page);
    await flowEscAccountSheet(page, "phone");
    await flowSelectedPinClear(page, "phone");
    await screenLookTabbar(page);
    await flowLookShopSheet(page);
    await screenCreateEntry(page);
    await screenHouses(page);
    await flowHouseGate(page);
    await flowYou(page);
    await flowAdminCancel(page);
    await screenEditGuest(page);
  }, "ui-phone", phone);

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenHousesWithoutScouted(page);
  }, "ui-houses-empty", phone);

  await withPage(browser, origin, async (page) => {
    await prime(page, { draft: true });
    await flowCreateBranches(page);
  }, "ui-create", phone);

  for (const [label, viewport] of [
    ["tablet-834", { width: 834, height: 1112 }],
    ["desktop-1194", { width: 1194, height: 834 }],
    ["desktop-1280", { width: 1280, height: 800 }],
    ["desktop-1440", { width: 1440, height: 900 }],
  ]) {
    await withPage(browser, origin, async (page) => {
      await prime(page, { draft: true });
      await screenCropLayout(page, label);
    }, `ui-crop-${label}`, { viewport });
  }

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenDesktop(page);
    await screenDesktopStyleRow(page);
    await screenDesktopLook(page);
  }, "ui-desktop", desk);

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowLookShopSheetTablet(page);
    await screenHousesTablet(page);
    await screenYouEmptyChip(page, "tablet");
    await flowEscAccountSheet(page, "tablet");
    await flowSelectedPinClear(page, "tablet");
  }, "ui-tablet", { viewport: { width: 834, height: 1112 } });

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await screenHouses1024(page);
  }, "ui-1024", { viewport: { width: 1024, height: 768 } });

  for (const [label, path, viewport] of [
    ["look-phone", "/looks/seed-sunday-coat", { width: 390, height: 844 }],
    ["home-phone", "/", { width: 390, height: 844 }],
    ["look-wide", "/looks/seed-sunday-coat", { width: 1280, height: 800 }],
    ["home-wide", "/", { width: 1280, height: 800 }],
  ]) {
    await withPage(browser, origin, async (page) => {
      await prime(page);
      await flowSaveResume(page, label, path);
    }, `ui-save-resume-${label}`, { viewport });
  }

  for (const [label, path, viewport] of [
    ["look-phone", "/looks/seed-sunday-coat", { width: 390, height: 844 }],
    ["home-tablet", "/", { width: 834, height: 1194 }],
    ["home-1024", "/", { width: 1024, height: 768 }],
    ["home-1280", "/", { width: 1280, height: 800 }],
  ]) {
    await withPage(browser, origin, async (page) => {
      await prime(page);
      await flowSaveSheetFocus(page, label, path);
      if (label !== "look-phone") await flowSaveSheetPlacement(page, label, path);
    }, `ui-save-sheet-${label}`, { viewport });
  }

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowHomeActionRowReducedMotion(page);
  }, "ui-home-reduced", phone);

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowHomeActionRowHidden(page, "834");
  }, "ui-home-actions-834", { viewport: { width: 834, height: 1112 } });

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowHomeActionRowHidden(page, "1280");
  }, "ui-home-actions-1280", { viewport: { width: 1280, height: 800 } });

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowHomeActionRowHidden(page, "1440");
  }, "ui-home-actions-1440", { viewport: { width: 1440, height: 900 } });

  await withPage(browser, origin, async (page) => {
    await prime(page);
    await flowHomeActionRowHidden(page, "1194");
  }, "ui-home-actions-1194", { viewport: { width: 1194, height: 834 } });

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
    if ((await page.locator(".look-studio").getAttribute("data-step")) === "crop") {
      await page.locator(".crop-frame").waitFor({ timeout: 8_000 });
      await page.getByRole("button", { name: "Skip" }).click();
    }
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
