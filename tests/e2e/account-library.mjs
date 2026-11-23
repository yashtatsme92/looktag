#!/usr/bin/env node
/**
 * Account Save and Follow: guest save carries into the account, a second
 * signed-in browser sees it, unsave removes it, and Following shows a
 * creator and a House. Widths 390, 834, and 1280.
 */
import { chromium } from "playwright";
import { resolveAdminCredentials, resolveOrigin } from "./helpers.mjs";

const origin = resolveOrigin();
const only = process.env.E2E_WIDTH || "";
const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1194 },
  { name: "desktop", width: 1280, height: 800 },
].filter((viewport) => !only || viewport.name === only);
let failed = false;

function record(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function prime(context) {
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("looktag-boot-v1", "done");
      localStorage.setItem("looktag-style-guide-v1", "done");
      localStorage.setItem("looktag-browse-coach-v1", "done");
    } catch {
      /* private mode */
    }
  });
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.routeReady === "true", null, {
    timeout: 45_000,
  });
}

async function gotoPath(page, path) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ready(page);
}

async function signInAdmin(page) {
  const { email, password } = resolveAdminCredentials();
  const typed = email.toLowerCase() === "hello@thelooktag.com" ? "admin" : email;
  await page.locator("#creator-email").fill(typed);
  await page.locator("#creator-password").fill(password);
  await page.locator("form").getByRole("button", { name: "Sign in with email" }).click();
}

async function openYouSignIn(page) {
  await gotoPath(page, "/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Sign in to sync You" }).waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL(/\/login\?/, { timeout: 15_000 });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 15_000 });
  await signInAdmin(page);
  await page.waitForURL((url) => url.pathname === "/login" && !url.search, { timeout: 20_000 });
  await ready(page);
}

function saveButton(page) {
  return page.getByRole("button", { name: /^Save( look)?$/ });
}

function unsaveButton(page) {
  return page.getByRole("button", { name: "Remove saved look" });
}

async function sundayCoatVisible(page) {
  return page.locator(".you-hangtag-name", { hasText: "Sunday Coat" }).count();
}

function followingOpen() {
  const stage = document.querySelector("[data-mode]");
  if (stage) return stage.getAttribute("data-mode") === "following";
  const current = document.querySelector('nav[aria-label="Looks"] button[aria-current="page"]');
  return (current?.textContent || "").includes("Following");
}

async function openFollowing(page) {
  const tab = page.locator('nav[aria-label="Looks"] button[aria-label^="Following"]');
  await tab.first().waitFor({ state: "visible", timeout: 15_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.evaluate(followingOpen)) return;
    await tab.first().click({ timeout: 8_000 });
    try {
      await page.waitForFunction(followingOpen, null, { timeout: 4_000 });
      return;
    } catch {
      /* a remount can put the feed back on For you */
    }
  }
  throw new Error("Following tab did not open");
}

async function failureSnap(page) {
  return page
    .evaluate(async () => {
      let follows = "";
      try {
        const res = await fetch("/api/v1/me/follows", { credentials: "include" });
        follows = `${res.status} ${(await res.text()).slice(0, 240)}`;
      } catch (error) {
        follows = error instanceof Error ? error.message : "fetch failed";
      }
      return {
        url: location.pathname,
        mode: document.querySelector("[data-mode]")?.getAttribute("data-mode") ?? null,
        current: document.querySelector('nav[aria-label="Looks"] button[aria-current="page"]')?.textContent?.trim() ?? null,
        follows,
        text: document.body.innerText.replace(/\s+/g, " ").slice(0, 280),
      };
    })
    .catch(() => null);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of widths) {
    const label = viewport.name;
    const context = await browser.newContext({ viewport });
    await prime(context);
    const page = await context.newPage();
    try {
      await gotoPath(page, "/looks/seed-sunday-coat");
      await saveButton(page).click();
      await page.getByRole("heading", { name: /^Sign in to save/ }).waitFor({ timeout: 8_000 });
      await page.getByRole("button", { name: "Continue with email" }).click();
      await page.waitForURL(/\/login\?/, { timeout: 15_000 });
      await page.locator("form[data-hydrated='true']").waitFor({ timeout: 15_000 });
      await signInAdmin(page);
      await page.waitForURL(/\/looks\/seed-sunday-coat/, { timeout: 25_000 });
      await gotoPath(page, "/login");
      await page.locator(".you-hangtag-name", { hasText: "Sunday Coat" }).waitFor({ timeout: 20_000 });
      record(`${label}.guest-save-on-saved`, (await sundayCoatVisible(page)) === 1);

      const other = await browser.newContext({ viewport });
      await prime(other);
      const page2 = await other.newPage();
      try {
        await openYouSignIn(page2);
        await page2.locator(".you-hangtag-name", { hasText: "Sunday Coat" }).waitFor({ timeout: 20_000 });
        record(`${label}.second-session-sees-save`, (await sundayCoatVisible(page2)) === 1);

        await gotoPath(page, "/looks/seed-sunday-coat");
        await unsaveButton(page).click();
        await saveButton(page).waitFor({ timeout: 15_000 });
        await gotoPath(page, "/login");
        await page.waitForFunction(
          () => ![...document.querySelectorAll(".you-hangtag-name")].some((node) => node.textContent?.includes("Sunday Coat")),
          null,
          { timeout: 20_000 },
        );
        record(`${label}.unsave-removes-card`, (await sundayCoatVisible(page)) === 0);

        await gotoPath(page2, "/login");
        await page2.waitForFunction(
          () => ![...document.querySelectorAll(".you-hangtag-name")].some((node) => node.textContent?.includes("Sunday Coat")),
          null,
          { timeout: 20_000 },
        );
        record(`${label}.second-session-unsave`, (await sundayCoatVisible(page2)) === 0);
      } finally {
        await other.close();
      }

      await gotoPath(page, "/looks/seed-sunday-coat");
      const creatorOn = page.getByRole("button", { name: "Following ✓" });
      if ((await creatorOn.count()) > 0) {
        await creatorOn.first().click();
        await page.getByText("Unfollowed Maya Chen").first().waitFor({ timeout: 15_000 });
      }
      await page.getByRole("button", { name: "Follow", exact: true }).first().click();
      await page.getByText("Following Maya Chen").first().waitFor({ timeout: 15_000 });

      await gotoPath(page, "/houses/label-atelier-noir");
      const houseOn = page.getByRole("button", { name: "Following ✓" });
      if ((await houseOn.count()) > 0) {
        await houseOn.first().click();
        await page.getByText("Unfollowed Atelier Noir").first().waitFor({ timeout: 15_000 });
      }
      await page.getByRole("button", { name: "Follow", exact: true }).first().click();
      await page.getByText("Following Atelier Noir").first().waitFor({ timeout: 15_000 });

      await gotoPath(page, "/");
      await openFollowing(page);
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return text.includes("Sunday Coat") && text.includes("Atelier Noir") && /house · new (line|style)/i.test(text);
        },
        null,
        { timeout: 20_000 },
      );
      record(`${label}.following-creator-and-house`, true);

      await page
        .evaluate(async () => {
          await fetch("/api/v1/me/follows/creators/seed-maya-chen", { method: "DELETE", credentials: "include" });
          await fetch("/api/v1/me/follows/houses/label-atelier-noir", { method: "DELETE", credentials: "include" });
          await fetch("/api/v1/me/saves/seed-sunday-coat", { method: "DELETE", credentials: "include" });
        })
        .catch(() => undefined);
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
      const snap = await failureSnap(page);
      record(`${label}.flow`, false, `${detail}${snap ? ` ${JSON.stringify(snap)}` : ""}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failed) process.exit(1);
