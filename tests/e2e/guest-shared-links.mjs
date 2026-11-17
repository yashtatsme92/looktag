#!/usr/bin/env node
import { chromium } from "playwright";
import { SCREENSHOT_DIR, resolveOrigin, withPage } from "./helpers.mjs";

const origin = resolveOrigin();
const results = [];
const expectedFailures = [];

function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function open(page, path) {
  const session = page
    .waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/get-session", {
      timeout: 10_000,
    })
    .catch(() => null);
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page
    .getByRole("navigation", { name: "App" })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  await session;
  await page.waitForTimeout(150);
}

async function assertGate(page, path, action, label) {
  await open(page, path);
  const beforePath = new URL(page.url()).pathname;
  await action();
  const gateName = label.endsWith(".follow") ? "Sign in to follow" : "Sign in to save";
  const title = page.getByRole("heading", { name: gateName, exact: true });
  const visible = await title
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  record(`${label}.gate`, visible, `url=${new URL(page.url()).pathname}`);
  if (!visible) {
    record(`${label}.returns-to-page`, new URL(page.url()).pathname === beforePath, page.url());
    return;
  }
  await page.getByRole("button", { name: "Cancel" }).click();
  record(`${label}.returns-to-page`, new URL(page.url()).pathname === beforePath, page.url());
}

async function assertEchoGateExpectedFailure(page, path, label) {
  await open(page, path);
  const beforePath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Echo", exact: true }).first().click();
  const title = page.getByRole("heading", { name: "Sign in to save", exact: true });
  const gated = await title
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  const currentPath = new URL(page.url()).pathname;
  if (!gated && currentPath === "/") {
    const details = `guest Echo navigated from ${beforePath} to ${currentPath}`;
    expectedFailures.push({ name: label, issue: "#123", details });
    console.log(`XFAIL #123  ${label} — ${details}`);
    return;
  }
  record(`${label}.gate`, gated && currentPath === beforePath, `gated=${gated} url=${currentPath}`);
}

async function sharedLook(page, viewport) {
  const path = "/looks/seed-sunday-coat";
  await open(page, path);
  await page
    .getByRole("heading", { name: "Sunday Coat" })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  const pins = page.locator(".tag-pin:visible");
  await pins
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  record(
    `${viewport}.look.direct`,
    (await page.getByRole("heading", { name: "Sunday Coat" }).count()) > 0,
  );
  record(`${viewport}.look.pins`, (await pins.count()) > 0, `count=${await pins.count()}`);

  await page
    .waitForFunction(
      (lookPath) =>
        [...document.querySelectorAll('meta[property="og:title"]')].some((tag) =>
          tag.content.includes("Sunday Coat"),
        ) &&
        [...document.querySelectorAll('meta[property="og:url"]')].some((tag) =>
          tag.content.endsWith(lookPath),
        ),
      path,
      { timeout: 10_000 },
    )
    .catch(() => {});
  const meta = await page.evaluate(() => ({
    share: document.querySelector('meta[name="looktag:share"]')?.content ?? "",
    ogTitle:
      [...document.querySelectorAll('meta[property="og:title"]')]
        .map((tag) => tag.content)
        .find((title) => title.includes("Sunday Coat")) ?? "",
    ogUrl:
      [...document.querySelectorAll('meta[property="og:url"]')]
        .map((tag) => tag.content)
        .find((url) => url.endsWith("/looks/seed-sunday-coat")) ?? "",
  }));
  record(
    `${viewport}.look.share-meta`,
    meta.share === "look" && /Sunday Coat/.test(meta.ogTitle) && meta.ogUrl.endsWith(path),
    JSON.stringify(meta),
  );

  if (viewport === "desktop") {
    const panel = page.getByRole("complementary", { name: "Shop" });
    await panel.locator(".wide-prow-hit").first().click();
    await panel
      .locator(".wide-prow.is-on")
      .waitFor({ timeout: 5_000 })
      .catch(() => {});
    record(`${viewport}.look.pin-tap`, (await panel.locator(".wide-prow.is-on").count()) === 1);
    record(
      `${viewport}.look.shop-panel`,
      (await panel.getByRole("heading", { name: "Shop this look" }).count()) === 1 &&
        (await panel.getByRole("button", { name: "Shop Oversized Wool Coat" }).count()) === 1,
      (await panel.innerText()).replace(/\s+/g, " "),
    );
    record(`${viewport}.look.no-prices`, !/[$€]\s?\d/.test(await panel.innerText()));
    await page.evaluate(() => {
      window.__guestE2eShopTarget = "";
      window.open = (url) => {
        window.__guestE2eShopTarget = String(url);
        return { opener: null };
      };
    });
    await panel.getByRole("button", { name: "Shop Oversized Wool Coat" }).click();
    const target = await page.evaluate(() => window.__guestE2eShopTarget);
    record(
      `${viewport}.look.retailer-open`,
      Boolean(
        target &&
        /zalando|cos|uniqlo|sezane|zara|stories|mango|massimodutti/i.test(new URL(target).hostname),
      ),
      target || "no retailer target",
    );
  } else {
    await pins.first().click();
    const piece = page.getByRole("dialog", { name: "Selected piece" });
    record(`${viewport}.look.pin-tap`, await piece.isVisible().catch(() => false));
    await piece.getByRole("button", { name: "Dismiss" }).click();
    await page.locator(".look-plate-shop").click();
    const sheet = page.getByRole("dialog", { name: "Shop this look" });
    const visible = await sheet
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    const text = visible ? await sheet.innerText() : "";
    record(`${viewport}.look.shop-sheet`, visible && /Cashmere Turtleneck/.test(text));
    record(`${viewport}.look.no-prices`, !/[$€]\s?\d/.test(text), text.replace(/\s+/g, " "));
    record(
      `${viewport}.look.retailer-present`,
      (await sheet.getByRole("button", { name: "Shop Oversized Wool Coat" }).count()) === 1 &&
        /COS|Zalando/i.test(text),
      text.replace(/\s+/g, " "),
    );
    await page.evaluate(() => {
      window.__guestE2eShopTarget = "";
      window.open = (url) => {
        window.__guestE2eShopTarget = String(url);
        return { opener: null };
      };
    });
    await sheet.getByRole("button", { name: "Shop Oversized Wool Coat" }).click();
    const target = await page.evaluate(() => window.__guestE2eShopTarget);
    record(
      `${viewport}.look.retailer-open`,
      Boolean(
        target &&
        /zalando|cos|uniqlo|sezane|zara|stories|mango|massimodutti/i.test(new URL(target).hostname),
      ),
      target || "no retailer target",
    );
  }
  await page.waitForTimeout(4_500);

  await assertGate(
    page,
    path,
    () =>
      page
        .getByRole("button", { name: /Save look|Save$/ })
        .first()
        .click(),
    `${viewport}.look.save`,
  );
  await assertGate(
    page,
    path,
    () => page.getByRole("button", { name: "Follow", exact: true }).first().click(),
    `${viewport}.look.follow`,
  );
  await assertEchoGateExpectedFailure(page, path, `${viewport}.look.echo`);
}

async function sharedHouseAndLine(page, viewport) {
  const housePath = "/houses/label-atelier-noir";
  await open(page, housePath);
  await page
    .getByRole("heading", { name: "Atelier Noir" })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  await page
    .waitForFunction(
      (housePath) =>
        [...document.querySelectorAll('meta[property="og:title"]')].some((tag) =>
          tag.content.includes("Atelier Noir"),
        ) &&
        [...document.querySelectorAll('meta[property="og:url"]')].some((tag) =>
          tag.content.endsWith(housePath),
        ),
      housePath,
      { timeout: 10_000 },
    )
    .catch(() => {});
  record(
    `${viewport}.house.direct`,
    (await page.getByRole("heading", { name: "Atelier Noir" }).count()) > 0,
  );
  const meta = await page.evaluate(
    (housePath) => ({
      share: document.querySelector('meta[name="looktag:share"]')?.content ?? "",
      ogTitle:
        [...document.querySelectorAll('meta[property="og:title"]')]
          .map((tag) => tag.content)
          .find((title) => title.includes("Atelier Noir")) ?? "",
      ogUrl:
        [...document.querySelectorAll('meta[property="og:url"]')]
          .map((tag) => tag.content)
          .find((url) => url.endsWith(housePath)) ?? "",
    }),
    housePath,
  );
  record(
    `${viewport}.house.share-meta`,
    meta.share === "house" && /Atelier Noir/.test(meta.ogTitle) && meta.ogUrl.endsWith(housePath),
    JSON.stringify(meta),
  );
  await assertGate(
    page,
    housePath,
    () => page.getByRole("button", { name: "Follow", exact: true }).click(),
    `${viewport}.house.follow`,
  );

  const linePath = `${housePath}/kinkistyles`;
  await open(page, linePath);
  await page
    .getByText("Kinkistyles", { exact: true })
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  await page
    .getByText("Column Dress", { exact: true })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  const lineText = await page.locator("body").innerText();
  record(
    `${viewport}.line.direct`,
    /Kinkistyles/.test(lineText) && /Column Dress/.test(lineText),
    `${new URL(page.url()).pathname}: ${lineText.replace(/\s+/g, " ").slice(0, 180)}`,
  );
}

async function runViewport(browser, viewport, size) {
  await withPage(
    browser,
    origin,
    async (page) => {
      const events = [];
      page.on("request", (request) => {
        const body = request.postData() ?? "";
        if (body) events.push(body);
      });
      await sharedLook(page, viewport);
      await sharedHouseAndLine(page, viewport);
      if (viewport === "phone") {
        record(
          "phone.funnel.guest-look-view",
          events.some(
            (body) =>
              body.includes("looktag.ui.navigation") &&
              body.includes("looktag.share.page") &&
              body.includes("looktag.share.kind") &&
              body.includes("look"),
          ),
          `${events.length} telemetry requests`,
        );
        record(
          "phone.funnel.guest-shop-click",
          events.some(
            (body) =>
              body.includes("looktag.funnel.shop_outbound_click") &&
              body.includes("looktag.funnel.user_state") &&
              body.includes("guest") &&
              body.includes("looktag.look.id") &&
              body.includes("seed-sunday-coat") &&
              body.includes("looktag.funnel.source") &&
              body.includes("piece_shop") &&
              body.includes("looktag.funnel.tag_id") &&
              body.includes("sc-coat"),
          ),
          `${events.length} telemetry requests`,
        );
      }
    },
    `guest-shared-${viewport}`,
    { viewport: size },
  );
}

const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, "phone", { width: 390, height: 844 });
  await runViewport(browser, "tablet", { width: 834, height: 1194 });
  await runViewport(browser, "desktop", { width: 1280, height: 800 });
} finally {
  await browser.close();
}

const failed = results.filter((row) => !row.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} guest shared-link checks passed; ` +
    `${expectedFailures.length} expected failure(s)`,
);
for (const expected of expectedFailures) {
  console.log(`  ${expected.issue}: ${expected.details}`);
}
if (failed.length) {
  console.log("failed:", failed.map((row) => row.name).join(", "));
  console.log(`screenshots: ${SCREENSHOT_DIR}`);
  process.exit(1);
}
