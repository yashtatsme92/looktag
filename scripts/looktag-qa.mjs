#!/usr/bin/env node
/**
 * Looktag regression cases. Run against the live app after a code change:
 *   node scripts/looktag-qa.mjs http://127.0.0.1:8080
 */
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const origin = checkedUrl(process.argv[2] ?? "http://127.0.0.1:8080");
const STYLE_GUIDE_KEY = "looktag-style-guide-v1";
const BROWSE_COACH_KEY = "looktag-browse-coach-v1";
const BOOT_SKIP_KEY = "looktag-boot-v1";

const cases = [];

function record(name, ok, detail = "") {
  cases.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.error(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function snippet(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function withPage(browser, fn) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-GB",
  });
  await context.addInitScript(
    ([guide, coach, boot]) => {
      try {
        localStorage.setItem(guide, "done");
        localStorage.setItem(coach, "done");
        sessionStorage.setItem(boot, "done");
      } catch {
        /* private mode */
      }
    },
    [STYLE_GUIDE_KEY, BROWSE_COACH_KEY, BOOT_SKIP_KEY],
  );
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

function productUrl(href) {
  if (!href) return false;
  try {
    const url = new URL(href);
    if (url.pathname === "/" || url.pathname === "") return false;
    return /zalando|zara|cos|uniqlo|arket|mango|sezane|stories|massimodutti|hm\.com/i.test(
      url.hostname,
    );
  } catch {
    return false;
  }
}

async function getSession(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    return res.json();
  });
}

async function fillSignup(page, { name, email, password }) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("#creator-email").waitFor({ timeout: 8_000 });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 }).catch(() => {});
  const nameField = page.locator("#creator-name");
  if ((await nameField.count()) === 0 || !(await nameField.isVisible().catch(() => false))) {
    const createTab = page.getByRole("button", { name: "Create account" }).first();
    await createTab.scrollIntoViewIfNeeded();
    await createTab.click();
    try {
      await nameField.waitFor({ timeout: 2_000 });
    } catch {
      await createTab.click({ force: true });
      await nameField.waitFor({ timeout: 4_000 });
    }
  }
  await nameField.scrollIntoViewIfNeeded();
  await nameField.fill(name);
  await page.locator("#creator-email").fill(email);
  await page.locator("#creator-password").fill(password);
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await withPage(browser, async (page) => {
      await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("navigation", { name: "App" }).waitFor({ timeout: 8_000 });
      const text = await page.locator("body").innerText();
      const hasTabs = /Looks/.test(text) && /Create/.test(text) && /Rank/.test(text);
      record("home_renders", hasTabs, hasTabs ? "" : snippet(text));
    });

    await withPage(browser, async (page) => {
      const started = Date.now();
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const form = page.locator("#creator-email");
      const disabled = page.getByText("Sign-in is disabled");
      await form.or(disabled).waitFor({ timeout: 8_000 });
      await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 }).catch(() => {});
      const hasForm = (await form.count()) > 0;
      record("login_form_ready", hasForm, `waited ${Date.now() - started}ms`);
      const text = await page.locator("body").innerText();
      record(
        "you_shows_saved",
        /Saved/.test(text) && /Double-tap|Keep looks|looks you keep|bookmark/i.test(text),
        snippet(text),
      );
    });

    await withPage(browser, async (page) => {
      await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("navigation", { name: "App" }).waitFor({ timeout: 8_000 });
      const look = page.getByRole("link", { name: /Sunday Coat|Coastal Linen|Quiet Tailor|Open the look/i }).first();
      await look.click();
      const shop = page.getByRole("link", { name: /^Shop/i }).first();
      await shop.waitFor({ timeout: 8_000 });
      const href = await shop.getAttribute("href");
      record("public_look_shop_link", productUrl(href), href ?? "missing shop href");
    });

    await withPage(browser, async (page) => {
      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByText(/Add a look photo|Take photo|Photo/i).first().waitFor({ timeout: 8_000 });
      const text = await page.locator("body").innerText();
      const ok = /Add a look photo/i.test(text) && /Take photo|Choose from library/i.test(text);
      record("create_guest_studio", ok, snippet(text));
    });

    await withPage(browser, async (page) => {
      const draft = {
        id: "qa-search-draft",
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
      const searchBtn = page.getByRole("button", { name: /Search item|Search again/i });
      await searchBtn.waitFor({ timeout: 10_000 });
      await searchBtn.scrollIntoViewIfNeeded();
      await searchBtn.click();
      const searching = page.getByText(/Searching shops|Comparing Zalando/i);
      await searching.first().waitFor({ timeout: 4_000 }).catch(async () => {
        await searchBtn.click({ force: true });
        await searching.first().waitFor({ timeout: 4_000 }).catch(() => {});
      });
      const listing = page.locator(
        'a[href*="zalando."], a[href*="zara.com"], a[href*="cos.com"], a[href*="hm.com"], a[href*="uniqlo.com"]',
      );
      const started = Date.now();
      await listing.first().waitFor({ timeout: 24_000 }).catch(() => {});
      const hrefs = (await listing.evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter(Boolean))).filter(
        (href) => productUrl(href),
      );
      await page.screenshot({ path: "/workspace/screenshots/search-item.png", fullPage: false }).catch(() => {});
      const shops = [...new Set(hrefs.map((href) => new URL(href).hostname.replace(/^www\d*\./, "")))];
      record(
        "search_item_listings",
        hrefs.length >= 2,
        hrefs.length
          ? `${hrefs.length} links from ${shops.join(", ")} in ${Date.now() - started}ms`
          : snippet(await page.locator("body").innerText()),
      );
    });

    await withPage(browser, async (page) => {
      await page.goto(`${origin}/rank`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("heading", { name: "Rank" }).waitFor({ timeout: 8_000 });
      const settled = page.getByText(/Sunday Coat|Coastal Linen|Quiet Tailor|pins ·/i);
      await settled.first().waitFor({ timeout: 10_000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      const pulse = (await page.locator(".animate-pulse").count()) > 0;
      const ok =
        !pulse &&
        (/Sunday Coat|Coastal Linen|Quiet Tailor|Gallery Hour/.test(text) || /pins ·/.test(text));
      record("rank_loads", ok, pulse ? "stuck on skeleton" : snippet(text));
    });

    await withPage(browser, async (page) => {
      await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("heading", { name: "Houses" }).waitFor({ timeout: 10_000 }).catch(() => {});
      const settled = page.getByText(/Atelier Noir|Salt & Loom|Press Line|Sunday Studio/i);
      await settled.first().waitFor({ timeout: 10_000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      record(
        "houses_section_renders",
        /Houses/.test(text) && /Atelier Noir/.test(text) && /Salt & Loom|Press Line/.test(text),
        snippet(text),
      );
      record(
        "houses_scouted_flag",
        /Scouted/i.test(text) && /Atelier Noir/.test(text) && /picked by Looktag/i.test(text),
        snippet(text),
      );
      record(
        "houses_rank",
        /House rank/.test(text) && /Atelier Noir/.test(text),
        snippet(text),
      );
      record(
        "houses_collections_named",
        /collection/i.test(text),
        snippet(text),
      );
      const forYou = page.getByRole("button", { name: "For you" });
      record("houses_liking_filter", (await forYou.count()) > 0, (await forYou.count()) > 0 ? "" : "missing For you");
    });

    await withPage(browser, async (page) => {
      await page.goto(`${origin}/houses/label-atelier-noir`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("heading", { name: /Atelier Noir/i }).waitFor({ timeout: 10_000 }).catch(() => {});
      const houseText = await page.locator("body").innerText();
      record(
        "house_collections_grouped",
        /Kinkistyles/.test(houseText) && /After Hours/.test(houseText),
        snippet(houseText),
      );
      await page.goto(`${origin}/houses/label-atelier-noir/kinkistyles`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await page.getByRole("heading", { name: /Kinkistyles/i }).waitFor({ timeout: 10_000 }).catch(() => {});
      const collectionText = await page.locator("body").innerText();
      record(
        "collection_page_renders",
        /Kinkistyles/.test(collectionText) && /Noir Column/.test(collectionText),
        snippet(collectionText),
      );
    });

    await withPage(browser, async (page) => {
      await page.goto(`${origin}/admin/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("heading", { name: /Sign-up|Studio|Houses/i }).first().waitFor({ timeout: 10_000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      const emailSwitch = page.getByRole("switch", { name: /Email/i });
      const housesSwitch = page.getByRole("switch", { name: /Houses/i });
      record(
        "studio_signup_toggles",
        /Email/.test(text) && /Google/.test(text) && /Houses/.test(text) && (await emailSwitch.count()) > 0 && (await housesSwitch.count()) > 0,
        snippet(text),
      );
    });

    await withPage(browser, async (page) => {
      const email = `qa-${Date.now()}@looktag.test`;
      const password = "password123";
      await fillSignup(page, { name: "QA Creator", email, password });

      let leftLogin = false;
      try {
        await page.waitForFunction(
          () => !location.pathname.startsWith("/login"),
          null,
          { timeout: 15_000 },
        );
        leftLogin = true;
      } catch {
        leftLogin = false;
      }
      await page.getByRole("heading", { name: /Looks|QA Creator|New look/i }).first().waitFor({
        timeout: 8_000,
      }).catch(() => {});
      const path = new URL(page.url()).pathname;
      const afterSignup = snippet(await page.locator("body").innerText());
      const stuckOnLogin = path.startsWith("/login") || /Please wait/i.test(afterSignup);
      record(
        "signup_leaves_login",
        leftLogin && !path.startsWith("/login"),
        leftLogin
          ? stuckOnLogin
            ? `landed on ${path}: ${afterSignup}`
            : ""
          : `still on login: ${afterSignup}`,
      );

      const session = await getSession(page);
      const userId = session?.user?.id;
      record("signup_has_session", Boolean(userId), userId ? "" : "get-session returned no user");

      const overlay = await page.locator("text=A style is a photograph").count();
      record("signup_no_style_guide", overlay === 0, overlay ? "style guide still covering the app" : "");

      if (!userId) return;

      await page.goto(`${origin}/creators/${userId}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      try {
        await page.getByRole("heading", { name: "QA Creator" }).waitFor({ timeout: 10_000 });
      } catch {
        /* recorded below */
      }
      const text = await page.locator("body").innerText();
      const pulse = (await page.locator(".animate-pulse").count()) > 0;
      const notFound = /Creator not found/i.test(text);
      record(
        "signup_you_profile",
        !pulse && !notFound && /QA Creator/.test(text),
        pulse ? "stuck on skeleton" : notFound ? "creator not found after signup" : snippet(text),
      );

      await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      try {
        await page.getByRole("button", { name: /Take photo|Publish look/i }).waitFor({ timeout: 10_000 });
      } catch {
        await page.getByText(/Add a look photo|Take photo|Look title|Sign in to publish/i).first().waitFor({
          timeout: 8_000,
        }).catch(() => {});
      }
      const createText = await page.locator("body").innerText();
      record(
        "create_after_auth",
        !/Sign in to publish/i.test(createText) && /Add a look photo|Take photo|Publish look/i.test(createText),
        /Sign in to publish/i.test(createText) ? "create still gated" : snippet(createText),
      );

      const signOut = page.getByRole("button", { name: "Sign out" });
      if ((await signOut.count()) === 0) {
        await page.goto(`${origin}/creators/${userId}`, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 8_000 }).catch(() => {});
      }
      if ((await page.getByRole("button", { name: "Sign out" }).count()) > 0) {
        await page.getByRole("button", { name: "Sign out" }).click();
        await page.waitForFunction(
          () => location.pathname === "/" || location.pathname.startsWith("/login"),
          null,
          { timeout: 10_000 },
        ).catch(() => {});
        await page.waitForTimeout(500);
        const after = await getSession(page);
        record("sign_out_clears_session", !after?.user, after?.user ? "session still present" : "");
      } else {
        record("sign_out_clears_session", false, "sign out control missing");
        return;
      }

      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.locator("#creator-email").waitFor({ timeout: 8_000 });
      await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 }).catch(() => {});
      const signInTab = page.getByRole("button", { name: "Sign in", exact: true });
      if (await signInTab.count()) {
        await signInTab.click();
        await page.getByRole("button", { name: "Sign in with email" }).waitFor({ timeout: 4_000 });
      }
      await page.locator("#creator-email").fill(email);
      await page.locator("#creator-password").fill(password);
      await page.getByRole("button", { name: "Sign in with email" }).click();
      let signedBackIn = false;
      try {
        await page.waitForFunction(
          () => !location.pathname.startsWith("/login"),
          null,
          { timeout: 15_000 },
        );
        signedBackIn = true;
      } catch {
        signedBackIn = false;
      }
      const backSession = await getSession(page);
      record(
        "signin_existing_account",
        signedBackIn && Boolean(backSession?.user?.id),
        signedBackIn ? (backSession?.user?.id ? "" : "no session after sign-in") : `still on login: ${snippet(await page.locator("body").innerText())}`,
      );
    });
  } finally {
    await browser.close();
  }

  const failed = cases.filter((item) => item.ok === false);
  const verdict = {
    ok: failed.length === 0,
    origin,
    passed: cases.filter((item) => item.ok).length,
    failed: failed.length,
    cases,
  };
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error) }, null, 2));
  process.exit(1);
});
