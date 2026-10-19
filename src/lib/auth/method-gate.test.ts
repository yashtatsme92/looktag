import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../settings/model.ts";
import { enforceSignInMethod, methodForAuthRequest } from "./method-gate.ts";

describe("methodForAuthRequest", () => {
  const cases: [string, unknown, string | null][] = [
    ["/sign-up/email", undefined, "email"],
    ["/sign-in/email", undefined, "email"],
    ["/sign-in/social", { provider: "google" }, "google"],
    ["/sign-in/social", { provider: "apple" }, "apple"],
    ["/sign-in/social", { provider: "twitter" }, "x"],
    ["/link-social", { providerId: "grok-google" }, "google"],
    ["/link-social", { provider: "grok-apple" }, "apple"],
    ["/sign-in/oauth2", { providerId: "grok-x" }, "x"],
    ["/callback/google", undefined, "google"],
    ["/callback/apple", undefined, "apple"],
    ["/callback/twitter", undefined, "x"],
    ["/oauth2/callback/grok-google", undefined, "google"],
    ["/oauth2/callback/grok-apple", undefined, "apple"],
    ["/oauth2/callback/grok-x", undefined, "x"],
    ["/api/auth/sign-in/email", undefined, "email"],
    ["/sign-out", undefined, null],
  ];

  for (const [path, body, method] of cases) {
    it(`maps ${path} to ${method ?? "no method"}`, () => {
      assert.equal(methodForAuthRequest(path, body), method);
    });
  }
});

describe("enforceSignInMethod", () => {
  const disabledSettings = { ...DEFAULT_SETTINGS, signupEmail: false };
  const disabledRoutes: [string, unknown, string][] = [
    ["/sign-up/email", undefined, "email"],
    ["/sign-in/email", undefined, "email"],
    ["/sign-in/social", { provider: "google" }, "google"],
    ["/link-social", { providerId: "grok-apple" }, "apple"],
    ["/sign-in/oauth2", { providerId: "grok-x" }, "x"],
    ["/callback/grok-google", undefined, "google"],
    ["/oauth2/callback/grok-apple", undefined, "apple"],
  ];

  for (const [path, body, method] of disabledRoutes) {
    it(`returns FORBIDDEN when ${method} is disabled for ${path}`, () => {
      assert.throws(
        () => enforceSignInMethod(path, body, disabledSettings),
        (error: unknown) => {
          assert.equal((error as { statusCode?: number }).statusCode, 403);
          assert.equal((error as Error).message, `Sign-in method disabled: ${method}`);
          return true;
        },
      );
    });
  }

  it("allows enabled methods and unrelated endpoints", () => {
    assert.doesNotThrow(() =>
      enforceSignInMethod("/sign-in/email", undefined, DEFAULT_SETTINGS),
    );
    assert.doesNotThrow(() =>
      enforceSignInMethod("/sign-out", undefined, DEFAULT_SETTINGS),
    );
  });
});
