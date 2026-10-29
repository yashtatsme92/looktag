#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  fillAdminLogin,
  isSwitchOn,
  resolveAdminCredentials,
  resolveOrigin,
  setSwitch,
  withPage,
} from "./helpers.mjs";

const origin = resolveOrigin();
const viewports = [
  { width: 390, height: 844 },
  { width: 834, height: 1194 },
  { width: 1280, height: 800 },
];

async function switchFor(page, label) {
  return page.getByRole("switch", { name: new RegExp(`${label} sign-up`, "i") });
}

async function assertLoginMethods(browser, viewport, expected) {
  await withPage(
    browser,
    origin,
    async (page) => {
      await page.goto(`${origin}/login?next=%2Fcreate`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await page.locator('[data-settings-hydrated="true"]').waitFor({ timeout: 10_000 });
      for (const [label, enabled] of [
        ["Google", expected.includes("Google")],
        ["Apple", expected.includes("Apple")],
        ["X", expected.includes("X")],
      ]) {
        const count = await page.getByRole("button", { name: `Continue with ${label}` }).count();
        assert.equal(count > 0, enabled, `${label} visibility at ${viewport.width}px`);
      }
      assert.equal(
        (await page.getByRole("button", { name: "Create account" }).count()) > 0,
        expected.includes("Email"),
        `Email signup visibility at ${viewport.width}px`,
      );
      if (expected.includes("Email")) {
        await page.locator("#creator-email").waitFor({ timeout: 10_000 });
      } else {
        assert.equal(await page.locator("#creator-email").count(), 0, "admin email is secondary");
        const adminSignIn = page.getByRole("button", { name: "Admin sign in" });
        assert.equal(await adminSignIn.isVisible(), true);
        if (expected.length > 0) {
          const provider = await page
            .getByRole("button", { name: `Continue with ${expected[0]}` })
            .elementHandle();
          const admin = await adminSignIn.elementHandle();
          const providerPrecedesAdmin = await page.evaluate(
            ({ providerButton, adminButton }) =>
              Boolean(
                providerButton.compareDocumentPosition(adminButton) &
                Node.DOCUMENT_POSITION_FOLLOWING,
              ),
            { providerButton: provider, adminButton: admin },
          );
          assert.equal(providerPrecedesAdmin, true, "enabled provider is primary");
        }
        if (expected.length > 0) {
          const providerButton = page.getByRole("button", { name: `Continue with ${expected[0]}` });
          const alert = page.getByRole("alert").filter({ hasText: /sign-in|wrong|fail/i });
          await page.route("**/api/auth/**sign-in/**", (route) =>
            route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
          );
          await providerButton.click();
          await alert.waitFor({ timeout: 10_000 });
          assert.equal(await providerButton.isEnabled(), true, "button re-enabled after failure");
          await page.unroute("**/api/auth/**sign-in/**");
          let hung;
          await page.route("**/api/auth/**sign-in/**", (route) => {
            hung = route;
          });
          await providerButton.click();
          await alert.waitFor({ state: "hidden", timeout: 2_000 });
          await alert.waitFor({ timeout: 12_000 });
          assert.equal(await providerButton.isEnabled(), true, "button re-enabled after timeout");
          if (hung) await hung.abort("failed");
          await page.unroute("**/api/auth/**sign-in/**", { behavior: "ignoreErrors" });
        }
        await page.goto(`${origin}/login?next=%2Fcreate`, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await page.locator('[data-settings-hydrated="true"]').waitFor({ timeout: 10_000 });
        await page.getByRole("button", { name: "Admin sign in" }).click();
        await page.locator("#creator-email").waitFor({ timeout: 10_000 });
      }
    },
    `auth-methods-login-${viewport.width}`,
    { viewport },
  );
}

async function assertForbiddenRoutes(page, routes, viewport) {
  const results = await page.evaluate(async (requests) => {
    const responses = [];
    for (const request of requests) {
      const response = await fetch(request.path, {
        method: request.method,
        headers: request.body ? { "content-type": "application/json" } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      responses.push({ path: request.path, status: response.status });
    }
    return responses;
  }, routes);
  for (const result of results) {
    assert.ok(
      result.status === 403 || result.status === 404,
      `${result.path} at ${viewport.width}px returned ${result.status}`,
    );
  }
}

async function assertRouteStatuses(page, routes, viewport) {
  const results = await page.evaluate(async (requests) => {
    const responses = [];
    for (const request of requests) {
      const response = await fetch(request.path, {
        method: request.method,
        headers: request.body ? { "content-type": "application/json" } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
        redirect: "manual",
      });
      responses.push({ path: request.path, status: response.status });
    }
    return responses;
  }, routes);
  for (const result of results) {
    assert.notEqual(result.status, 403, `${result.path} should be enabled at ${viewport.width}px`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    await withPage(
      browser,
      origin,
      async (page) => {
        await fillAdminLogin(page, origin);
        await page.goto(`${origin}/admin/studio`, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await page.locator('[data-hydrated="true"]').waitFor({ timeout: 10_000 });

        const apple = await switchFor(page, "Apple");
        const google = await switchFor(page, "Google");
        const email = await switchFor(page, "Email");
        const x = await switchFor(page, "X");

        await setSwitch(apple, false);
        await setSwitch(google, false);
        await setSwitch(email, true);
        await setSwitch(x, false);
        assert.equal(await google.isDisabled(), true, "Google disabled while Apple is off");
        assert.equal(await isSwitchOn(google), false);

        await setSwitch(apple, true);
        assert.equal(await google.isDisabled(), false, "Google enabled after Apple is on");
        await setSwitch(google, true);
        await setSwitch(x, true);
        // Default AUTH_PROVIDER is better-auth. Google and Apple buttons appear
        // only when their client credentials are set. X is a Grok broker id and
        // stays hidden unless AUTH_PROVIDER=grok. This suite sets neither.
        await assertLoginMethods(browser, viewport, ["Email"]);

        await setSwitch(google, false);
        await assertForbiddenRoutes(
          page,
          [
            {
              path: "/api/auth/sign-in/social",
              method: "POST",
              body: { provider: "google", callbackURL: "/" },
            },
            {
              path: "/api/auth/sign-in/oauth2",
              method: "POST",
              body: { providerId: "grok-google", callbackURL: "/" },
            },
            { path: "/api/auth/callback/grok-google", method: "GET" },
            { path: "/api/auth/oauth2/callback/grok-google", method: "GET" },
          ],
          viewport,
        );
        await assertRouteStatuses(
          page,
          [
            { path: "/api/auth/callback/grok-apple", method: "GET" },
            { path: "/api/auth/oauth2/callback/grok-apple", method: "GET" },
            { path: "/api/auth/callback/grok-x", method: "GET" },
            { path: "/api/auth/oauth2/callback/grok-x", method: "GET" },
          ],
          viewport,
        );

        await setSwitch(email, false);
        const { email: adminEmail, password: adminPassword } = resolveAdminCredentials();
        const adminEmailStatus = await page.evaluate(
          async ({ email: accountEmail, password }) => {
            const response = await fetch("/api/auth/sign-in/email", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: accountEmail, password }),
            });
            return response.status;
          },
          { email: adminEmail, password: adminPassword },
        );
        assert.equal(adminEmailStatus, 200, "admin email sign-in remains available");
        await assertLoginMethods(browser, viewport, []);
        // Provider-button copy is covered when a social client is configured.
        // With no credentials the buttons are absent, so there is nothing to click.
        await assertForbiddenRoutes(
          page,
          [
            {
              path: "/api/auth/sign-up/email",
              method: "POST",
              body: { name: "Test", email: "test@example.com", password: "password123" },
            },
            {
              path: "/api/auth/sign-in/email",
              method: "POST",
              body: { email: "test@example.com", password: "password123" },
            },
          ],
          viewport,
        );
        await setSwitch(email, true);

        await setSwitch(apple, false);
        assert.equal(await isSwitchOn(google), false, "Turning Apple off also disables Google");
        await assertForbiddenRoutes(
          page,
          [
            {
              path: "/api/auth/link-social",
              method: "POST",
              body: { providerId: "grok-apple", callbackURL: "/" },
            },
            { path: "/api/auth/callback/grok-apple", method: "GET" },
            { path: "/api/auth/oauth2/callback/grok-apple", method: "GET" },
          ],
          viewport,
        );
        await assertRouteStatuses(
          page,
          [
            { path: "/api/auth/callback/grok-x", method: "GET" },
            { path: "/api/auth/oauth2/callback/grok-x", method: "GET" },
          ],
          viewport,
        );
        await assertLoginMethods(browser, viewport, ["Email"]);
        await setSwitch(x, false);
        await assertForbiddenRoutes(
          page,
          [
            {
              path: "/api/auth/sign-in/social",
              method: "POST",
              body: { provider: "twitter", callbackURL: "/" },
            },
            {
              path: "/api/auth/oauth2/link",
              method: "POST",
              body: { providerId: "grok-x", callbackURL: "/" },
            },
            { path: "/api/auth/callback/grok-x", method: "GET" },
            { path: "/api/auth/oauth2/callback/grok-x", method: "GET" },
          ],
          viewport,
        );
        await assertLoginMethods(browser, viewport, ["Email"]);
      },
      `auth-methods-admin-${viewport.width}`,
      { viewport },
    );
    console.log(`ok  auth methods at ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
}
