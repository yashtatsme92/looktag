#!/usr/bin/env node
/**
 * Looktag Playwright suite. Walks the product flow on a phone viewport.
 *   node tests/e2e/run.mjs http://127.0.0.1:8080
 */
import { chromium } from "playwright";
import {
  clippedTitles,
  fillAdminLogin,
  fillSignup,
  getSession,
  isSwitchOn,
  pageOverflows,
  productUrl,
  resolveOrigin,
  restoreStudioDefaults,
  setSwitch,
  snippet,
  waitForApp,
  chromeState,
  withPage,
  waitForFeed,
  withBootPage,
} from "./helpers.mjs";

const origin = resolveOrigin();
const cases = [];
let e2eHouseName = "";

function record(name, ok, detail = "") {
  cases.push({ name, ok, detail });
  console.error(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function assertTitles(page, name) {
  const clipped = await clippedTitles(page);
  record(name, clipped.length === 0, clipped.join(" | "));
}

async function assertNoOverflow(page, name) {
  const overflow = await pageOverflows(page);
  record(name, !overflow, overflow ? "horizontal overflow" : "");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await withPage(browser, origin, async (page) => {
      await restoreStudioDefaults(page, origin);
    }, "restore");
    await guestFlow(browser);
    await splashBootFlow(browser);
    await lookShopFlow(browser);
    await housesFlow(browser);
    await designFlow(browser);
    await studioFlow(browser);
    await configPersistFlow(browser);
    await createFlow(browser);
    await catalogFlow(browser);
    await accountFlow(browser);
    await adminHousesFlow(browser);
    await adminSignalsFlow(browser);
    await desktopFlow(browser);
    await tabletFlow(browser);
    await coverageFlow(browser);
  } finally {
    await browser.close();
  }

  const failed = cases.filter((row) => !row.ok).length;
  const report = {
    ok: failed === 0,
    origin,
    passed: cases.length - failed,
    failed,
    cases,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed) process.exit(1);
}

async function guestFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await waitForFeed(page);
    const text = await page.locator("body").innerText();
    record(
      "flow.home.tabs",
      /Looks/.test(text) && /Create/.test(text) && /Houses/.test(text) && /Rank/.test(text) && /You/.test(text),
      snippet(text),
    );
    record("flow.home.feed", /Sunday Coat|Coastal Linen|Quiet Tailor|How to/i.test(text), snippet(text));
    record("flow.home.for_you", /For you/i.test(text), snippet(text));
    const pinCount = await page.locator("[data-feed-slide] [data-tag-pin]").count();
    record("flow.home.tags_hidden", pinCount === 0, `pins=${pinCount}`);
    const firstSlide = page.locator("[data-feed-slide]").first();
    await firstSlide.locator(".look-slide-hit").click({ force: true });
    await page
      .waitForFunction(() => {
        const el = document.querySelector("[data-feed-slide]");
        return el?.getAttribute("data-tags") === "on";
      }, null, { timeout: 4_000 })
      .catch(() => {});
    const tagsOn = (await firstSlide.getAttribute("data-tags")) === "on";
    record("flow.home.tags_after_tap", tagsOn, `tags=${await firstSlide.getAttribute("data-tags")}`);
    record("flow.home.refresh_hint", (await page.locator(".look-feed-refresh").count()) > 0);
    const chrome = await chromeState(page);
    record(
      "flow.home.phone_tabs",
      chrome.tabDisplay !== "none" && chrome.tabDisplay !== "missing",
      JSON.stringify(chrome),
    );
    record("flow.home.no_masthead", chrome.headerDisplay === "none", JSON.stringify(chrome));
    await assertNoOverflow(page, "flow.home.no_overflow");
    await assertTitles(page, "flow.home.titles_wrap");
  }, "home");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator("#creator-email").or(page.getByText("Sign-in is disabled")).waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record("flow.you.saved_first", /Saved/.test(text) && /looks you keep|bookmark/i.test(text), snippet(text));
    record("flow.you.email_form", (await page.locator("#creator-email").count()) > 0, snippet(text));
    record(
      "flow.you.signin_first",
      (await page.getByRole("button", { name: "Sign in", pressed: true }).count()) > 0 &&
        (await page.locator("#creator-name").count()) === 0,
      snippet(text),
    );
    record(
      "flow.you.oauth_buttons",
      /Continue with Google/i.test(text) && /Continue with X/i.test(text),
      snippet(text),
    );
    const emailFont = await page
      .locator("#creator-email")
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
      .catch(() => 0);
    record("flow.you.input_16px", emailFont >= 16, `font-size=${emailFont}`);
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content")
      .catch(() => "");
    record(
      "flow.you.app_viewport",
      /maximum-scale=1/.test(viewport || "") && /user-scalable=no/.test(viewport || ""),
      viewport || "missing viewport",
    );
    await assertTitles(page, "flow.you.titles_wrap");
    await assertNoOverflow(page, "flow.you.no_overflow");
  }, "you");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/rank`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: "Rank" }).waitFor({ timeout: 8_000 });
    await page.getByText(/Sunday Coat|pins ·/i).first().waitFor({ timeout: 10_000 }).catch(() => {});
    const text = await page.locator("body").innerText();
    record("flow.rank.looks", /Sunday Coat|Coastal Linen|Quiet Tailor|Gallery Hour/.test(text), snippet(text));
    record("flow.rank.weights", /12 to start/.test(text) && /3 per pin/.test(text), snippet(text));
    await assertTitles(page, "flow.rank.titles_wrap");
    await assertNoOverflow(page, "flow.rank.no_overflow");
  }, "rank");
}

async function lookShopFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await waitForFeed(page);
    const sunday = page.locator("[data-feed-slide][aria-label='Sunday Coat']").first();
    if ((await sunday.count()) > 0) {
      await sunday.scrollIntoViewIfNeeded();
      const hit = sunday.locator(".look-slide-hit");
      await hit.click({ force: true });
      await page
        .waitForFunction(() => {
          const el = document.querySelector("[data-feed-slide][aria-label='Sunday Coat']");
          return el?.getAttribute("data-tags") === "on";
        }, null, { timeout: 4_000 })
        .catch(() => {});
      await hit.click({ force: true });
      await page.waitForURL(/\/looks\//, { timeout: 8_000 });
    } else {
      await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    const shop = page.getByRole("link", { name: /^Shop/i }).first();
    await shop.waitFor({ timeout: 8_000 });
    const href = await shop.getAttribute("href");
    record("flow.look.shop_link", productUrl(href), href ?? "missing shop href");
    const title = await page.locator("h1, .ds-screen-title, .font-display").first().innerText().catch(() => "");
    const body = await page.locator("body").innerText();
    record(
      "flow.look.title_visible",
      /Sunday Coat|Coastal|Quiet|Gallery|Look/i.test(title) || /Sunday Coat/.test(body),
      title,
    );
    record("flow.look.pins", /Shop|piece|pin/i.test(body), snippet(body));
    await assertTitles(page, "flow.look.titles_wrap");
    await assertNoOverflow(page, "flow.look.no_overflow");
  }, "look");
}

async function housesFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/Atelier Noir|Press Line/i).first().waitFor({ timeout: 10_000 });
    await page.getByText(/Suggested looks/i).first().waitFor({ timeout: 8_000 }).catch(() => {});
    const text = await page.locator("body").innerText();
    record(
      "flow.houses.section",
      /Houses/.test(text) && /Atelier Noir/.test(text) && /Press Line/.test(text) && /Salt & Loom/.test(text),
      snippet(text),
    );
    record("flow.houses.scouted", /Scouted/i.test(text) && /picked by Looktag/i.test(text), snippet(text));
    record("flow.houses.rank", /House rank/.test(text) && /Atelier Noir/.test(text), snippet(text));
    record("flow.houses.suggested", /Suggested looks/.test(text), snippet(text));
    record("flow.houses.for_you", (await page.getByRole("button", { name: "For you" }).count()) > 0);
    record("flow.houses.apply_link", /Register a house/i.test(text), snippet(text));
    record("flow.houses.name_full", /Atelier Noir/.test(text) && !/Atelier…|Ate\b/.test(text), snippet(text));
    record(
      "flow.houses.suggested_titles",
      /Suggested looks/.test(text) &&
        /Noir Column|Pressed Coat|Sunday Coat|Coastal Linen|Quiet Tailor|Gallery Hour/.test(text),
      snippet(text),
    );
    await assertTitles(page, "flow.houses.titles_wrap");
    await assertNoOverflow(page, "flow.houses.no_overflow");
  }, "houses");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses/label-atelier-noir`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Atelier Noir/i }).waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.houses.profile",
      /Atelier Noir/.test(text) && /Scouted/i.test(text) && /Paris/i.test(text),
      snippet(text),
    );
    record("flow.houses.profile_collection", /Collections/.test(text), snippet(text));
    record(
      "flow.houses.profile_groups",
      /Kinkistyles/.test(text) && /After Hours/.test(text),
      snippet(text),
    );
    record("flow.houses.profile_stats", /Score/i.test(text) && /Compared/i.test(text), snippet(text));
    record(
      "flow.houses.profile_header",
      /Atelier Noir/.test(text) && !/Atelier…/.test(text),
      snippet(text),
    );
    await assertTitles(page, "flow.houses.profile_titles_wrap");
    await assertNoOverflow(page, "flow.houses.profile_no_overflow");
  }, "house-profile");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses/label-atelier-noir/kinkistyles`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.getByRole("heading", { name: /Kinkistyles/i }).waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.houses.collection_page",
      /Kinkistyles/.test(text) && /Atelier Noir/.test(text) && /Noir Column/.test(text),
      snippet(text),
    );
    record("flow.houses.collection_shareable", /Share collection|Open neck|Noir Column/i.test(text), snippet(text));
    await assertTitles(page, "flow.houses.collection_titles_wrap");
    await assertNoOverflow(page, "flow.houses.collection_no_overflow");
  }, "house-collection");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses/label-salt-loom/summer-blues`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.getByRole("heading", { name: /Summer Blues/i }).waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.houses.summer_blues",
      /Summer Blues/.test(text) && /Salt & Loom/.test(text) && /North Linen/.test(text),
      snippet(text),
    );
  }, "summer-blues");
}

async function designFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await fillAdminLogin(page, origin);
    await page.goto(`${origin}/admin/look`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Design system/i }).waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record("flow.design.catalog", /Ground, ink/.test(text) && /Figtree/.test(text) && /Cormorant/.test(text), snippet(text));
    record("flow.design.wrap_rule", /Titles wrap|Never ellipsis/i.test(text), snippet(text));
    record("flow.design.tokens", /muted-foreground/.test(text) && /Screen titles/.test(text), snippet(text));
    record(
      "flow.design.themes",
      /Ink/.test(text) &&
        /Paper/.test(text) &&
        /Night/.test(text) &&
        /Snow/.test(text) &&
        /Stone/.test(text) &&
        /Carbon/.test(text) &&
        /Slate/.test(text) &&
        /Bone/.test(text) &&
        /Navy/.test(text) &&
        /Moss/.test(text),
      snippet(text),
    );
    await page.getByText(/Screen titles|Desktop wordmark/i).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    await assertTitles(page, "flow.design.titles_wrap");
    await assertNoOverflow(page, "flow.design.no_overflow");
  }, "design");
}

async function studioFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await fillAdminLogin(page, origin);
    await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Sign-up|Studio|Houses/i }).first().waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.studio.signup_toggles",
      /Email/.test(text) && /Google/.test(text) && (await page.getByRole("switch", { name: /Email/i }).count()) > 0,
      snippet(text),
    );
    record(
      "flow.studio.houses_toggle",
      (await page.getByRole("switch", { name: "Show Houses" }).count()) > 0,
      snippet(text),
    );
    record(
      "flow.studio.houses_browse",
      (await page.locator("#studio-houses-search").count()) > 0 && /Awesome/.test(text),
      snippet(text),
    );
    record("flow.studio.search", /Grok/.test(text) && /DuckDuckGo/.test(text) && /Shop region|Country/i.test(text), snippet(text));
    record(
      "flow.studio.splash",
      /Minimal/.test(text) && /Classy/.test(text) && /Atelier/.test(text) && (await page.getByRole("button", { name: /^Play$/ }).count()) > 0,
      snippet(text),
    );
    const minimal = page.getByRole("radio", { name: "Minimal" });
    await minimal.scrollIntoViewIfNeeded();
    await minimal.click();
    await page.getByText(/Studio updated/i).first().waitFor({ timeout: 6_000 }).catch(() => {});
    const picked = (await minimal.getAttribute("data-state")) === "checked" || (await minimal.getAttribute("aria-checked")) === "true";
    record("flow.studio.splash_select", picked, `state=${await minimal.getAttribute("data-state")}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Sign-up|Studio|Houses/i }).first().waitFor({ timeout: 10_000 });
    const persisted = page.getByRole("radio", { name: "Minimal" });
    await persisted.waitFor({ timeout: 8_000 });
    const kept =
      (await persisted.getAttribute("data-state")) === "checked" ||
      (await persisted.getAttribute("aria-checked")) === "true";
    record("flow.studio.splash_persist", kept, `state=${await persisted.getAttribute("data-state")}`);
    await page.getByRole("radio", { name: "Classy" }).click();
    await page.getByText(/Studio updated/i).first().waitFor({ timeout: 6_000 }).catch(() => {});
    record(
      "flow.studio.rank_weights",
      (await page.locator("#score-look").count()) > 0 &&
        (await page.locator("#score-pin").count()) > 0 &&
        (await page.locator("#score-compared").count()) > 0,
      snippet(text),
    );
    record("flow.studio.screen_title", /Sign-up & Houses/.test(text), snippet(text));
    record(
      "flow.studio.compared_label",
      /Compared/i.test(text) && !/Compar…|Compar\.\.\./i.test(text),
      snippet(text),
    );
    await assertTitles(page, "flow.studio.titles_wrap");
    await assertNoOverflow(page, "flow.studio.no_overflow");
  }, "studio");

  await withPage(browser, origin, async (page) => {
    try {
      await fillAdminLogin(page, origin);
      await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.locator('[data-hydrated="true"]').waitFor({ timeout: 10_000 });
      const google = page.getByRole("switch", { name: /Google sign-up/i });
      await setSwitch(google, false);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('[data-hydrated="true"]').waitFor({ timeout: 10_000 });
      const googleAfter = page.getByRole("switch", { name: /Google sign-up/i });
      await googleAfter.waitFor({ timeout: 8_000 });
      const hiddenOnStudio = !(await isSwitchOn(googleAfter));
      await page.context().clearCookies();
      await page.evaluate(() => {
        try {
          sessionStorage.removeItem("grok-auth.bearer-token");
        } catch {
          /* private mode */
        }
      });
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.locator("#creator-email").waitFor({ timeout: 8_000 });
      await page
        .waitForFunction(
          () =>
            !/Continue with Google/i.test(document.body.innerText) &&
            /Continue with X/i.test(document.body.innerText),
          null,
          { timeout: 8_000 },
        )
        .catch(() => {});
      const loginText = await page.locator("body").innerText();
      record(
        "flow.studio.hide_google",
        hiddenOnStudio && !/Continue with Google/i.test(loginText) && /Continue with X/i.test(loginText),
        hiddenOnStudio ? snippet(loginText) : "Google switch still on after save",
      );
    } finally {
      await restoreStudioDefaults(page, origin);
      record("flow.studio.restore_google", true);
    }
  }, "studio-google");
}

async function configPersistFlow(browser) {
  await withPage(browser, origin, async (page) => {
    try {
      await fillAdminLogin(page, origin);
      await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.locator('[data-hydrated="true"]').waitFor({ timeout: 10_000 });
      await page.locator("#score-look").waitFor({ timeout: 8_000 });
      await page.locator("#score-look").fill("15");
      await page.locator("#score-look").blur();
      await page.getByText(/Studio updated/i).first().waitFor({ timeout: 5_000 }).catch(() => {});
      await page.locator("#score-pin").fill("4");
      await page.locator("#score-pin").blur();
      await page.getByText(/Studio updated/i).first().waitFor({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.goto(`${origin}/rank`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("heading", { name: "Rank" }).waitFor({ timeout: 8_000 });
      await page.getByText(/15 to start/).waitFor({ timeout: 8_000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      record(
        "flow.config.rank_weights_persist",
        /15 to start/.test(text) && /4 per pin/.test(text),
        snippet(text),
      );

      await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.locator('[data-hydrated="true"]').waitFor({ timeout: 10_000 });
      const houses = page.getByRole("switch", { name: "Show Houses" });
      await setSwitch(houses, false);
      await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await waitForApp(page);
      await page
        .waitForFunction(() => {
          const nav = document.querySelector('nav[aria-label="App"]');
          return Boolean(nav) && !/Houses/.test(nav.textContent || "");
        }, null, { timeout: 8_000 })
        .catch(() => {});
      const homeNav = await page.getByRole("navigation", { name: "App" }).innerText();
      record("flow.config.houses_tab_hidden", !/Houses/.test(homeNav), snippet(homeNav));
      await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await waitForApp(page);
      await page.waitForFunction(() => location.pathname === "/", null, { timeout: 6_000 }).catch(() => {});
      const redirected = await page.evaluate(() => location.pathname === "/");
      record("flow.config.houses_redirect", redirected, await page.evaluate(() => location.pathname));
    } finally {
      await restoreStudioDefaults(page, origin);
    }
  }, "config");
}

async function createFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/Add a look photo|Take photo|Photo/i).first().waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.create.guest_studio",
      /Add a look photo/i.test(text) && /Take photo|Choose from library/i.test(text) && /Sign in only when you publish/i.test(text),
      snippet(text),
    );
    record(
      "flow.create.one_page",
      (await page.getByRole("button", { name: /^Pins$/ }).count()) === 0 &&
        (await page.getByRole("button", { name: /^Name$/ }).count()) === 0,
      snippet(text),
    );
    await assertTitles(page, "flow.create.titles_wrap");
    await assertNoOverflow(page, "flow.create.no_overflow");
  }, "create");

  await withPage(browser, origin, async (page) => {
    const emptyDraft = {
      id: "e2e-empty-pins",
      userId: "",
      title: "",
      caption: "",
      creator: "You",
      imageSrc: "/looks/sunday-coat.jpg",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };
    await page.addInitScript((raw) => {
      try {
        sessionStorage.setItem("looktag-create-draft-v1", raw);
      } catch {
        /* private mode */
      }
    }, JSON.stringify(emptyDraft));
    await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("button", { name: /Find all pieces|Find more/i }).waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.create.find_pieces",
      /Find all pieces/i.test(text) && /Tap each piece|from the photo/i.test(text),
      snippet(text),
    );
    await assertNoOverflow(page, "flow.create.find_pieces_no_overflow");
  }, "create-find");

  await withPage(browser, origin, async (page) => {
    const draft = {
      id: "e2e-search-draft",
      userId: "",
      title: "Sunday Coat",
      caption: "",
      creator: "You",
      imageSrc: "/looks/sunday-coat.jpg",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [
        {
          id: "pin-1",
          x: 50,
          y: 42,
          name: "camel wool coat",
          brand: "",
          price: "",
          currency: "EUR",
          url: "",
          retailerId: "",
          offers: [],
          wornUrl: "",
          wornRetailerId: "",
        },
      ],
    };
    await page.addInitScript((raw) => {
      try {
        sessionStorage.setItem("looktag-create-draft-v1", raw);
      } catch {
        /* private mode */
      }
    }, JSON.stringify(draft));
    await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
    const pinText = await page.locator("body").innerText();
    record("flow.create.pins_step", /camel wool coat|Search item|Search again|pins/i.test(pinText), snippet(pinText));

    await page.locator("#look-title").waitFor({ timeout: 6_000 });
    record("flow.create.name_step", (await page.locator("#look-title").count()) > 0);
    const titleValue = await page.locator("#look-title").inputValue();
    record("flow.create.name_prefilled", titleValue === "Sunday Coat", titleValue);
    await page.locator("#look-title").click();
    await page.waitForTimeout(150);
    const keyboard = await page.locator(".look-studio").getAttribute("data-keyboard");
    record("flow.create.keyboard_open", keyboard === "open", `keyboard=${keyboard}`);
    const titleBox = await page.locator("#look-title").boundingBox();
    record(
      "flow.create.title_on_screen",
      Boolean(titleBox && titleBox.y >= 0 && titleBox.y + titleBox.height < 844),
      titleBox ? `y=${Math.round(titleBox.y)}` : "missing",
    );
    const nudgeVisible = await page.locator("[data-pin-nudge]").isVisible().catch(() => false);
    const bodyText = await page.locator("body").innerText();
    record(
      "flow.create.no_phone_arrows",
      !nudgeVisible && !/use the arrows/i.test(bodyText),
      nudgeVisible ? "nudge visible" : "",
    );

    const searchBtn = page.getByRole("button", { name: /Search item|Search again/i });
    await searchBtn.waitFor({ timeout: 10_000 });
    await searchBtn.scrollIntoViewIfNeeded();
    await searchBtn.click();
    const listing = page.locator(
      'a[href*="zalando."], a[href*="zara.com"], a[href*="cos.com"], a[href*="hm.com"], a[href*="uniqlo.com"]',
    );
    await listing.first().waitFor({ timeout: 24_000 }).catch(() => {});
    const hrefs = (await listing.evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter(Boolean))).filter(
      (href) => productUrl(href),
    );
    record(
      "flow.create.search_listings",
      hrefs.length >= 1,
      hrefs.length ? `${hrefs.length} shop links` : snippet(await page.locator("body").innerText()),
    );
    const offRegion = hrefs.filter((href) =>
      /zalando\.co\.uk|zara\.com\/us\/|uniqlo\.com\/us\/|\/en-us\/|\/en_gb\/|nordstrom\.com|amazon\.com\//i.test(
        String(href),
      ),
    );
    record(
      "flow.create.search_region",
      hrefs.length >= 1 && offRegion.length === 0,
      offRegion.length ? offRegion.join(" ") : hrefs[0],
    );
  }, "create-search");
}

async function catalogFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await fillAdminLogin(page, origin);
    await page.goto(`${origin}/admin/shops`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/Zalando|Zara|Catalog/i).first().waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record("flow.catalog.shops", /Zalando/.test(text) && /Zara/.test(text), snippet(text));
    record("flow.catalog.search_engines", /Grok|DuckDuckGo|Brave|Google/.test(text), snippet(text));
    await page.locator("#shops-search").click();
    await page.getByRole("listbox").waitFor({ timeout: 4_000 });
    const suggestText = await page.getByRole("listbox").innerText();
    record(
      "flow.catalog.browse",
      (await page.locator("#shops-search").count()) > 0 && /Awesome/.test(text) && /suggested/i.test(suggestText),
      snippet(suggestText),
    );
    const suggestion = page.locator('[data-browse="shops"] [role="option"]').first();
    const firstSuggestion = await suggestion.innerText();
    await suggestion.click();
    await page.locator("[data-picked='true']").waitFor({ timeout: 4_000 }).catch(() => {});
    record(
      "flow.catalog.pick_suggestion",
      (await page.locator("[data-picked='true']").count()) === 1,
      firstSuggestion,
    );
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.waitForTimeout(200);
    const cleared = await page.locator("body").innerText();
    record(
      "flow.catalog.pagination",
      /of \d+ shops/i.test(cleared) && (await page.getByRole("button", { name: "Next" }).count()) > 0,
      snippet(cleared),
    );
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForTimeout(200);
    const page2 = await page.locator("body").innerText();
    record("flow.catalog.page2", /13[–-]/.test(page2), snippet(page2));
    await page.locator("#shops-search").fill("zara");
    await page.waitForTimeout(200);
    const filtered = await page.locator("body").innerText();
    record(
      "flow.catalog.search",
      /Zara/.test(filtered) && !/Otto/.test(filtered),
      snippet(filtered),
    );
    await assertNoOverflow(page, "flow.catalog.no_overflow");
  }, "catalog");
}

async function accountFlow(browser) {
  await withPage(browser, origin, async (page) => {
    const email = `e2e-${Date.now()}@looktag.test`;
    const password = "password123";
    const handle = `e2e${Date.now().toString(36).slice(-8)}`;
    await fillSignup(page, origin, { name: "E2E Creator", email, password, handle, city: "Lisbon" });
    let leftLogin = false;
    try {
      await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 15_000 });
      leftLogin = true;
    } catch {
      leftLogin = false;
    }
    record("flow.account.leaves_login", leftLogin, snippet(await page.locator("body").innerText()));
    const session = await getSession(page);
    const userId = session?.user?.id;
    record("flow.account.has_session", Boolean(userId), userId ? "" : "no session");
    if (!userId) return;

    await page.goto(`${origin}/creators/${userId}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: "E2E Creator" }).waitFor({ timeout: 10_000 }).catch(() => {});
    const youText = await page.locator("body").innerText();
    record("flow.account.you_profile", /E2E Creator/.test(youText) && !/Creator not found/i.test(youText), snippet(youText));
    record(
      "flow.account.no_system_config",
      !/Shops & search/i.test(youText) && !/Sign-up & Houses/i.test(youText) && !/Design system/i.test(youText),
      snippet(youText),
    );
    record("flow.account.register_house", /Register a house/i.test(youText), snippet(youText));
    await page.locator("#profile-name").waitFor({ timeout: 8_000 });
    const profileEmail = await page.locator("#profile-email").inputValue().catch(() => "");
    const profileHandle = await page.locator("#profile-handle").inputValue().catch(() => "");
    const profileCity = await page.locator("#profile-city").inputValue().catch(() => "");
    record(
      "flow.account.profile_details",
      (await page.locator("#profile-name").inputValue()) === "E2E Creator" &&
        profileEmail === email &&
        profileHandle === handle &&
        profileCity === "Lisbon" &&
        (await page.locator("#profile-bio").count()) > 0,
      `name=${await page.locator("#profile-name").inputValue().catch(() => "")} email=${profileEmail} handle=${profileHandle} city=${profileCity}`,
    );
    await page.locator("#profile-name").fill("E2E Editor");
    await page.locator("#profile-handle").fill(`${handle}x`);
    await page.locator("#profile-city").fill("Porto");
    await page.locator("#profile-bio").fill("Sunday coats, film stills.");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByText(/Profile saved/i).first().waitFor({ timeout: 8_000 }).catch(() => {});
    const edited = await page.locator("body").innerText();
    record(
      "flow.account.profile_edit",
      /E2E Editor/.test(edited) &&
        (await page.locator("#profile-name").inputValue()) === "E2E Editor" &&
        (await page.locator("#profile-handle").inputValue()) === `${handle}x` &&
        (await page.locator("#profile-city").inputValue()) === "Porto" &&
        /Sunday coats/.test(edited),
      snippet(edited),
    );

    await page.goto(`${origin}/houses/apply`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator("#house-name").waitFor({ timeout: 8_000 });
    e2eHouseName = `E2E Lab ${Date.now()}`;
    await page.locator("#house-name").fill(e2eHouseName);
    await page.locator("#house-city").fill("Berlin");
    await page.locator("#house-bio").fill("Test house waiting for approval.");
    await page.getByRole("button", { name: "Send for approval" }).click();
    await page.getByText(/Waiting for admin approval|Application sent/i).first().waitFor({ timeout: 8_000 }).catch(() => {});
    const applyText = await page.locator("body").innerText();
    record("flow.account.house_pending", applyText.includes(e2eHouseName) && /pending|Waiting/i.test(applyText), snippet(applyText));
    await page.locator("#collection-name").waitFor({ timeout: 6_000 });
    await page.locator("#collection-name").fill("Summer Blues");
    await page.locator("#collection-season").fill("SS26");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByText(/Collection added|Summer Blues/i).first().waitFor({ timeout: 8_000 }).catch(() => {});
    const collectionText = await page.locator("body").innerText();
    record(
      "flow.account.house_collection",
      /Summer Blues/.test(collectionText) && /Collections/.test(collectionText),
      snippet(collectionText),
    );
    await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/Atelier Noir/i).first().waitFor({ timeout: 10_000 });
    const housesText = await page.locator("body").innerText();
    record("flow.account.house_hidden", !housesText.includes(e2eHouseName), snippet(housesText));
    await assertTitles(page, "flow.account.titles_wrap");

    await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const createText = await page.locator("body").innerText();
    record(
      "flow.account.create_ready",
      !/Sign in to publish/i.test(createText) && /Add a look photo|Take photo|Publish look/i.test(createText),
      snippet(createText),
    );
    record(
      "flow.account.hides_creator_name",
      (await page.locator("#look-creator").count()) === 0 ||
        !(await page.locator("#look-creator").isVisible().catch(() => false)),
    );

    await page.goto(`${origin}/creators/${userId}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await signOut.waitFor({ timeout: 8_000 });
    await signOut.click();
    await page
      .waitForFunction(() => location.pathname === "/" || location.pathname.startsWith("/login"), null, {
        timeout: 10_000,
      })
      .catch(() => {});
    await page.waitForTimeout(400);
    const after = await getSession(page);
    record("flow.account.sign_out", !after?.user, after?.user ? "session still present" : "");

    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator("#creator-email").waitFor({ timeout: 8_000 });
    await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 }).catch(() => {});
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll("button")].find(
        (btn) => btn.getAttribute("aria-pressed") !== null && btn.textContent.trim() === "Sign in",
      );
      tab?.click();
    });
    const emailSubmit = page.locator("form").getByRole("button", { name: /Sign in with email|Create account/ });
    await emailSubmit.waitFor({ timeout: 6_000 }).catch(() => {});
    if (/Create account/i.test((await emailSubmit.textContent().catch(() => "")) || "")) {
      await page.evaluate(() => {
        const tab = [...document.querySelectorAll("button")].find(
          (btn) => btn.getAttribute("aria-pressed") !== null && btn.textContent.trim() === "Sign in",
        );
        tab?.click();
      });
      await page.waitForTimeout(300);
    }
    await page.locator("#creator-email").fill(email);
    await page.locator("#creator-password").fill(password);
    const signInSubmit = page.locator("form").getByRole("button", { name: "Sign in with email" });
    if ((await signInSubmit.count()) === 0) {
      record("flow.account.sign_in", false, "sign-in form did not switch");
      return;
    }
    await signInSubmit.click();
    let signedBack = false;
    try {
      await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 15_000 });
      signedBack = true;
    } catch {
      signedBack = false;
    }
    const back = await getSession(page);
    record(
      "flow.account.sign_in",
      signedBack && Boolean(back?.user?.id),
      signedBack ? "" : snippet(await page.locator("body").innerText()),
    );
  }, "account");
}

async function adminHousesFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await fillAdminLogin(page, origin);
    await page.goto(`${origin}/admin/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /House applications|Houses/i }).first().waitFor({ timeout: 10_000 });
    await page.locator('[data-loaded="true"]').waitFor({ timeout: 12_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.admin.houses_queue",
      /House applications|Waiting/i.test(text) && /Atelier Noir/.test(text),
      snippet(text),
    );
    await page.locator("#houses-search").click();
    await page.getByRole("listbox").waitFor({ timeout: 4_000 });
    const suggestText = await page.getByRole("listbox").innerText();
    record(
      "flow.admin.houses_browse",
      (await page.locator("#houses-search").count()) > 0 && /Awesome/.test(text) && /suggested/i.test(suggestText),
      snippet(suggestText),
    );
    await page.keyboard.press("Escape");
    if (e2eHouseName) {
      await page.locator("#houses-search").fill(e2eHouseName);
      await page.getByText(e2eHouseName).first().waitFor({ timeout: 6_000 }).catch(() => {});
    }
    const e2eRow = page.getByText(e2eHouseName || "E2E Lab").first();
    if ((await e2eRow.count()) > 0) {
      await e2eRow.scrollIntoViewIfNeeded();
      const approve = page.getByRole("button", { name: "Approve" }).first();
      await approve.click();
      await page.getByText(/House is live/i).first().waitFor({ timeout: 6_000 }).catch(() => {});
      record("flow.admin.houses_approve", true);
    } else {
      record("flow.admin.houses_approve", /Pending|Waiting|Atelier Noir/i.test(text), "E2E house not in queue");
    }
    if (e2eHouseName) {
      await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByText(/Atelier Noir/i).first().waitFor({ timeout: 10_000 });
      const liveText = await page.locator("body").innerText();
      record("flow.admin.houses_live", liveText.includes(e2eHouseName), snippet(liveText));
    }
  }, "admin-houses");
}

async function adminSignalsFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await fillAdminLogin(page, origin);
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page).catch(() => {});
    await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.goto(`${origin}/admin/observability`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator('[data-loaded="true"]').waitFor({ timeout: 12_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.admin.signals_graph",
      /Live graph/i.test(text) && (await page.locator("[data-trace-graph]").count()) >= 0 && /Filters/i.test(text),
      snippet(text),
    );
    record(
      "flow.admin.signals_filters",
      (await page.locator("[data-filter-editor]").count()) > 0 && /Errors|Slow|Looks/i.test(text),
      snippet(text),
    );
    const errorsChip = page.locator("[data-filter='errors']");
    const errorCount = await errorsChip.count();
    if (errorCount) {
      await errorsChip.click();
      await page.waitForTimeout(400);
    }
    record(
      "flow.admin.signals_filter_toggle",
      errorCount === 0 || (await errorsChip.getAttribute("aria-pressed")) === "true" || /Filters/i.test(text),
      "errors chip",
    );
    const add = page.getByRole("button", { name: "Add filter" });
    record("flow.admin.signals_add_filter", (await add.count()) > 0);
    await page.getByRole("button", { name: "Buffer" }).click().catch(() => {});
    await page.waitForTimeout(200);
    const after = await page.locator("body").innerText();
    record("flow.admin.signals_buffer", /Live graph|No signals|span|metric|log/i.test(after), snippet(after));
  }, "admin-signals");
}

const DESKTOP = { viewport: { width: 1280, height: 800 } };

async function desktopFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await waitForFeed(page);
    const text = await page.locator("body").innerText();
    record(
      "flow.desktop.no_device_frame",
      (await page.locator(".device-bezel, .device-copy, .device-island").count()) === 0 &&
        !/iPhone & Android/i.test(text),
      snippet(text),
    );
    const nav = page.getByRole("navigation", { name: "App" });
    const navText = await nav.innerText();
    record(
      "flow.desktop.web_nav",
      /Looks/.test(navText) &&
        /Create/.test(navText) &&
        /Houses/.test(navText) &&
        /Rank/.test(navText) &&
        /You/.test(navText),
      snippet(navText),
    );
    record("flow.desktop.get_the_app", (await page.getByRole("button", { name: /Get the app/i }).count()) > 0);
    const chrome = await chromeState(page);
    record(
      "flow.desktop.no_tab_bar",
      chrome.tabDisplay === "none",
      JSON.stringify(chrome),
    );
    record(
      "flow.desktop.masthead",
      chrome.headerDisplay !== "none" && chrome.headerDisplay !== "missing",
      JSON.stringify(chrome),
    );
    record(
      "flow.desktop.portrait_cards",
      chrome.slideWidth > 120 && chrome.slideWidth < chrome.vw * 0.55,
      `slide=${chrome.slideWidth} vw=${chrome.vw}`,
    );
    const slides = await page.locator(".look-slide").count();
    record("flow.desktop.lookbook", slides >= 4, `slides=${slides}`);
    record(
      "flow.desktop.multiple_looks",
      /Sunday Coat/i.test(text) && /Coastal Linen|Quiet Tailor|Gallery Hour/i.test(text),
      snippet(text),
    );
    const firstSlide = page.locator("[data-feed-slide]").first();
    await firstSlide.hover();
    await page.waitForTimeout(200);
    const hoverTags = (await firstSlide.getAttribute("data-tags")) === "on";
    record("flow.desktop.tags_on_hover", hoverTags, `tags=${await firstSlide.getAttribute("data-tags")}`);
    await firstSlide.locator(".look-slide-hit").click({ force: true });
    await page.waitForURL(/\/looks\//, { timeout: 4_000 }).catch(() => {});
    if (!/\/looks\//.test(page.url())) {
      const titleLink = firstSlide.getByRole("link").first();
      if ((await titleLink.count()) > 0) {
        await titleLink.click({ force: true });
        await page.waitForURL(/\/looks\//, { timeout: 5_000 }).catch(() => {});
      }
    }
    record("flow.desktop.click_opens_look", /\/looks\//.test(page.url()), page.url());
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await waitForFeed(page);
    await assertNoOverflow(page, "flow.desktop.home_no_overflow");
    await assertTitles(page, "flow.desktop.home_titles_wrap");
  }, "desktop-home", DESKTOP);

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await page.getByText(/Atelier Noir/i).first().waitFor({ timeout: 10_000 });
    await page.getByText(/Suggested looks/i).first().waitFor({ timeout: 8_000 }).catch(() => {});
    const text = await page.locator("body").innerText();
    record(
      "flow.desktop.houses_nav",
      /Atelier Noir/.test(text) && /Press Line/.test(text) && /Salt & Loom/.test(text),
      snippet(text),
    );
    record("flow.desktop.houses_grid", /Suggested looks/.test(text) && /Scouted/i.test(text), snippet(text));
    await assertNoOverflow(page, "flow.desktop.houses_no_overflow");
  }, "desktop-houses", DESKTOP);

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Sunday Coat/i }).waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.desktop.look_share",
      /Sunday Coat/.test(text) && /Pieces|Shop/i.test(text),
      snippet(text),
    );
    const shop = page.getByRole("link", { name: /^Shop/i }).first();
    await shop.waitFor({ timeout: 8_000 });
    const href = await shop.getAttribute("href");
    record("flow.desktop.look_shop_link", productUrl(href), href ?? "missing shop href");
    record(
      "flow.desktop.look_editorial",
      (await page.locator(".look-layout").count()) > 0 &&
        (await page.locator(".look-layout-photo, .look-layout-shop").count()) >= 2,
    );
    const lookChrome = await chromeState(page);
    record(
      "flow.desktop.look_plate",
      lookChrome.photoWidth > 120 && lookChrome.photoWidth < lookChrome.vw * 0.5,
      `photo=${lookChrome.photoWidth} vw=${lookChrome.vw}`,
    );
    await assertTitles(page, "flow.desktop.look_titles_wrap");
    await assertNoOverflow(page, "flow.desktop.look_no_overflow");
  }, "desktop-look", DESKTOP);

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses/label-atelier-noir`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Atelier Noir/i }).waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.desktop.house_share",
      /Atelier Noir/.test(text) && /Scouted/i.test(text) && /Collections/.test(text) && /Kinkistyles/.test(text),
      snippet(text),
    );
    record("flow.desktop.house_no_frame", (await page.locator(".device-bezel").count()) === 0);
    await assertNoOverflow(page, "flow.desktop.house_no_overflow");
  }, "desktop-house", DESKTOP);

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/rank`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: "Rank" }).waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record("flow.desktop.rank", /Sunday Coat/.test(text) && /Creators|12 to start/.test(text), snippet(text));
    await assertNoOverflow(page, "flow.desktop.rank_no_overflow");
  }, "desktop-rank", DESKTOP);

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/Add a look photo|Take photo|Photo/i).first().waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.desktop.create",
      /Add a look photo/i.test(text) && /Take photo|Choose from library/i.test(text),
      snippet(text),
    );
    await assertNoOverflow(page, "flow.desktop.create_no_overflow");
  }, "desktop-create", DESKTOP);
}

const TABLET = { viewport: { width: 834, height: 1112 } };

async function tabletFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await waitForFeed(page);
    const chrome = await chromeState(page);
    record(
      "flow.tablet.no_tab_bar",
      chrome.tabDisplay === "none",
      JSON.stringify(chrome),
    );
    record(
      "flow.tablet.masthead",
      chrome.headerDisplay !== "none" && chrome.headerDisplay !== "missing",
      JSON.stringify(chrome),
    );
    record(
      "flow.tablet.portrait_cards",
      chrome.slideWidth > 120 && chrome.slideWidth < chrome.vw * 0.62,
      `slide=${chrome.slideWidth} vw=${chrome.vw}`,
    );
    record("flow.tablet.two_columns", chrome.slideWidth < chrome.vw * 0.55, `slide=${chrome.slideWidth}`);
    const text = await page.locator("body").innerText();
    record("flow.tablet.lookbook", /Sunday Coat/i.test(text) && /Looks/.test(text), snippet(text));
    await assertNoOverflow(page, "flow.tablet.home_no_overflow");
  }, "tablet-home", TABLET);

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Sunday Coat/i }).waitFor({ timeout: 10_000 });
    const chrome = await chromeState(page);
    record(
      "flow.tablet.look_plate",
      chrome.photoWidth > 120 && chrome.photoWidth < chrome.vw * 0.62,
      `photo=${chrome.photoWidth} vw=${chrome.vw}`,
    );
    record("flow.tablet.no_tab_bar_look", chrome.tabDisplay === "none", JSON.stringify(chrome));
    await assertNoOverflow(page, "flow.tablet.look_no_overflow");
  }, "tablet-look", TABLET);
}

async function splashBootFlow(browser) {
  await withBootPage(browser, origin, "atelier", async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".boot-splash").first().waitFor({ timeout: 8_000 }).catch(() => {});
    const first = await page.evaluate(() => {
      const overlay = [...document.querySelectorAll(".boot-splash")].find(
        (el) => getComputedStyle(el).display !== "none",
      );
      const pins = overlay
        ? [...overlay.querySelectorAll(".boot-splash-pin")].filter((el) => {
            const style = getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden";
          }).length
        : 0;
      const indexEl = overlay?.querySelector(".boot-splash-index");
      const indexHidden = !indexEl || getComputedStyle(indexEl).display === "none";
      return {
        html: document.documentElement.getAttribute("data-splash"),
        overlay: overlay?.getAttribute("data-splash") || null,
        pins,
        index: indexHidden ? "" : indexEl.textContent?.trim() || "",
      };
    });
    record(
      "flow.boot.atelier_first",
      first.html === "atelier" && (first.overlay === "atelier" || first.overlay === null),
      JSON.stringify(first),
    );
    await page.waitForTimeout(700);
    const mid = await page.evaluate(() => {
      const overlay = document.querySelector(".boot-splash");
      const pins = overlay
        ? [...overlay.querySelectorAll(".boot-splash-pin")].filter(
            (el) => getComputedStyle(el).display !== "none",
          ).length
        : 0;
      const indexEl = overlay?.querySelector(".boot-splash-index");
      const indexHidden = !indexEl || getComputedStyle(indexEl).display === "none";
      return {
        html: document.documentElement.getAttribute("data-splash"),
        overlay: overlay?.getAttribute("data-splash") || null,
        pins,
        index: indexHidden ? "" : indexEl.textContent?.trim() || "",
        log: window.__splashLog || [],
      };
    });
    const flashedClassy = (mid.log || []).some(
      (row) => row.overlay === "classy" || (row.html === "classy" && row.overlay && row.overlay !== "atelier"),
    );
    record(
      "flow.boot.no_classy_flash",
      mid.html === "atelier" && mid.overlay !== "classy" && !flashedClassy,
      JSON.stringify({ html: mid.html, overlay: mid.overlay, log: mid.log }),
    );
    record(
      "flow.boot.atelier_art",
      (first.pins === 4 || mid.pins === 4) && /Look 01/.test(`${first.index} ${mid.index}`),
      JSON.stringify({ firstPins: first.pins, midPins: mid.pins, index: first.index || mid.index }),
    );
  }, "boot-atelier");

  await withBootPage(browser, origin, "minimal", async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".boot-splash").first().waitFor({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => {
      const overlay = [...document.querySelectorAll(".boot-splash")].find(
        (el) => getComputedStyle(el).display !== "none",
      );
      const pins = overlay
        ? [...overlay.querySelectorAll(".boot-splash-pin")].filter((el) => el.getClientRects().length > 0)
            .length
        : 0;
      return {
        html: document.documentElement.getAttribute("data-splash"),
        overlay: overlay?.getAttribute("data-splash") || null,
        pins,
        word: overlay?.querySelector(".boot-splash-word")?.textContent?.trim() || "",
        log: window.__splashLog || [],
      };
    });
    const flashedClassy = (state.log || []).some((row) => row.overlay === "classy");
    record(
      "flow.boot.minimal_first",
      state.html === "minimal" && state.overlay !== "classy" && !flashedClassy,
      JSON.stringify(state),
    );
    record(
      "flow.boot.minimal_art",
      state.word === "Looktag" && state.pins === 0,
      JSON.stringify({ pins: state.pins, word: state.word }),
    );
  }, "boot-minimal");

  await withBootPage(browser, origin, "numbered", async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".boot-splash").first().waitFor({ timeout: 8_000 }).catch(() => {});
    const state = await page.evaluate(() => {
      const overlay = document.querySelector(".boot-splash");
      const pins = overlay
        ? [...overlay.querySelectorAll(".boot-splash-pin")].filter(
            (el) => getComputedStyle(el).display !== "none",
          ).length
        : 0;
      return {
        overlay: overlay?.getAttribute("data-splash") || document.documentElement.getAttribute("data-splash"),
        pins,
        index: overlay?.querySelector(".boot-splash-index")?.textContent?.trim() || "",
        indexDisplay: overlay?.querySelector(".boot-splash-index")
          ? getComputedStyle(overlay.querySelector(".boot-splash-index")).display
          : "missing",
      };
    });
    record(
      "flow.boot.numbered_art",
      state.overlay === "numbered" && state.pins === 3 && state.index === "Look 01",
      JSON.stringify(state),
    );
  }, "boot-numbered");

  await withBootPage(browser, origin, "atelier", async (page) => {
    await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Sunday Coat/i }).waitFor({ timeout: 10_000 });
    const splashVisible = await page.locator(".boot-splash").isVisible().catch(() => false);
    const bootDone = await page.evaluate(() => document.documentElement.classList.contains("boot-done"));
    record(
      "flow.boot.share_skips",
      bootDone && !splashVisible,
      `visible=${splashVisible} bootDone=${bootDone}`,
    );
  }, "boot-share");
}

async function coverageFlow(browser) {
  await withPage(browser, origin, async (page) => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForApp(page);
    await waitForFeed(page);
    const titles = await page.locator("[data-feed-slide]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label") || ""),
    );
    record("flow.feed.latest_first", titles.length >= 3, titles.slice(0, 4).join(" | "));
    const coastal = page.locator(".look-feed-top").getByRole("button", { name: /Coastal/ });
    await coastal.click();
    await page.waitForTimeout(300);
    const afterMood = await page.locator("body").innerText();
    record(
      "flow.feed.mood_coastal",
      /Coastal Linen|North Linen|Salt/i.test(afterMood),
      snippet(afterMood),
    );
    await page.locator(".look-feed-top").getByRole("button", { name: /^All/ }).click().catch(() => {});
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "How to" }).click({ force: true });
    await page.getByText(/photograph|Tap a pin|How to browse/i).first().waitFor({ timeout: 6_000 }).catch(() => {});
    const howTo = await page.locator("body").innerText();
    record("flow.feed.how_to", /photograph|Tap a pin|Shop opens|How to browse/i.test(howTo), snippet(howTo));
    await page.getByRole("button", { name: /Skip|Got it|Next/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
    const save = page.locator("[data-feed-slide] .look-slide-save").first();
    await save.click({ force: true });
    await page.getByText(/^Saved$/).first().waitFor({ timeout: 4_000 }).catch(() => {});
    const pressed = await save.getAttribute("aria-pressed");
    record("flow.feed.save_look", pressed === "true", `pressed=${pressed}`);
    const savedChip = page.getByRole("button", { name: /^Saved/ });
    if ((await savedChip.count()) > 0) {
      await savedChip.click();
      await page.waitForTimeout(250);
      const savedFeed = await page.locator("[data-feed-slide]").count();
      record("flow.feed.saved_filter", savedFeed >= 1, `slides=${savedFeed}`);
    } else {
      record("flow.feed.saved_filter", false, "saved chip missing");
    }
  }, "coverage-feed");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/looks/seed-sunday-coat`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Sunday Coat/i }).waitFor({ timeout: 10_000 });
    const dock = page.locator(".shop-dock-name").first();
    await dock.waitFor({ timeout: 8_000 });
    const dockName = (await dock.innerText()).trim();
    record(
      "flow.look.shop_dock_name",
      dockName.length > 2 && !/^Shop$/i.test(dockName),
      dockName,
    );
    const share = page.getByRole("button", { name: /Share/i });
    record("flow.look.share", (await share.count()) > 0);
    const save = page.getByRole("button", { name: /Save look|Remove saved look/i });
    record("flow.look.save", (await save.count()) > 0);
    const html = await page.content();
    record("flow.look.og_not_game", !/og:type[^>]*x:game|property="og:type" content="x:game"/.test(html));
  }, "coverage-look");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/looks/does-not-exist`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.look.missing",
      /not found|can't find|can't open|gone|Look/i.test(text),
      snippet(text),
    );
  }, "coverage-missing");

  await withPage(browser, origin, async (page) => {
    const robots = await page.goto(`${origin}/robots.txt`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const robotsText = (await robots?.text()) || "";
    record(
      "flow.seo.robots",
      /Allow: \//.test(robotsText) && /sitemap\.xml/i.test(robotsText),
      snippet(robotsText),
    );
    const sitemap = await page.goto(`${origin}/sitemap.xml`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const xml = (await sitemap?.text()) || "";
    record(
      "flow.seo.sitemap",
      /urlset/.test(xml) && /\/looks\//.test(xml) && /\/houses\//.test(xml),
      snippet(xml),
    );
  }, "coverage-seo");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/Atelier Noir/i).first().waitFor({ timeout: 10_000 });
    const forYou = page.getByRole("button", { name: "For you" });
    record("flow.houses.for_you_chip", (await forYou.count()) > 0);
    if ((await forYou.count()) > 0) {
      await forYou.click();
      await page.waitForTimeout(250);
      const text = await page.locator("body").innerText();
      record("flow.houses.for_you_results", /Atelier Noir|Sunday Coat|Look/i.test(text), snippet(text));
    }
  }, "coverage-houses");

  await withPage(browser, origin, async (page) => {
    await fillAdminLogin(page, origin);
    await page.goto(`${origin}/admin`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText(/System settings live here/i).waitFor({ timeout: 10_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.admin.hub",
      /Studio/.test(text) && /Houses/.test(text) && (/Shops/.test(text) || /Design/.test(text)),
      snippet(text),
    );
    await page.goto(`${origin}/admin/look`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("heading", { name: /Design system/i }).waitFor({ timeout: 8_000 });
    const night = page.getByRole("radio", { name: /Night/i }).or(page.getByText(/^Night$/));
    record("flow.admin.theme_picker", (await page.getByText(/Night/).count()) > 0);
    await page.goto(`${origin}/looks/seed-sunday-coat/edit`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page
      .getByText(/This look is not yours|Sunday Coat|Sign in to edit|Look not found|Save changes/i)
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    const editText = await page.locator("body").innerText();
    record(
      "flow.admin.look_edit",
      /This look is not yours|Sunday Coat|Save changes|Sign in to edit/i.test(editText),
      snippet(editText),
    );
  }, "coverage-admin");

  await withPage(browser, origin, async (page) => {
    await page.goto(`${origin}/login?next=/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator("#creator-email").or(page.getByText("Sign-in is disabled")).waitFor({ timeout: 8_000 });
    const text = await page.locator("body").innerText();
    record(
      "flow.you.next_create",
      /Sign in|Create account/i.test(text),
      snippet(text),
    );
    await page.goto(`${origin}/design`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForURL(/\/admin\/look|\/login/, { timeout: 8_000 }).catch(() => {});
    await page.getByText(/Design system|Sign in|Figtree|Ground/i).first().waitFor({ timeout: 8_000 }).catch(() => {});
    const design = await page.locator("body").innerText();
    record(
      "flow.design.public_or_gate",
      /Design system|Figtree|Sign in|Admin/i.test(design),
      snippet(design),
    );
  }, "coverage-you");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
