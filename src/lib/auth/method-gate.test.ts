import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADMIN_EMAIL, LEGACY_ADMIN_EMAIL } from "../admin/access.ts";
import { DEFAULT_SETTINGS } from "../settings/model.ts";
import { enforceSignInMethod, methodForAuthRequest } from "./method-gate.ts";

describe("methodForAuthRequest", () => {
  const cases: [
    string,
    unknown,
    string | null,
    Record<string, unknown>?,
    string?,
  ][] = [
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
    ["/oauth2/callback/:providerId", undefined, "google", { providerId: "grok-google" }],
    ["/callback/:id", undefined, "apple", { id: "grok-apple" }],
    ["/oauth2/callback/:providerId", undefined, "x", undefined, "https://looktag.test/api/auth/oauth2/callback/grok-x"],
    ["/oauth2/link", { providerId: "grok-apple" }, "apple"],
    ["/oauth2/link", { providerId: "provider-not-configured" }, "unknown"],
    ["/api/auth/sign-in/email", undefined, "email"],
    ["/sign-out", undefined, null],
  ];

  for (const [path, body, method, params, requestUrl] of cases) {
    it(`maps ${path} to ${method ?? "no method"}`, () => {
      assert.equal(methodForAuthRequest(path, body, { params, requestUrl }), method);
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

  it("allows an admin to sign in by email when email sign-up is disabled", () => {
    assert.doesNotThrow(() =>
      enforceSignInMethod(
        "/sign-in/email",
        { email: DEFAULT_ADMIN_EMAIL },
        { ...DEFAULT_SETTINGS, signupEmail: false },
      ),
    );
  });

  it("does not let an allowlisted address sign up when email sign-up is disabled", () => {
    assert.throws(
      () =>
        enforceSignInMethod(
          "/sign-up/email",
          { email: DEFAULT_ADMIN_EMAIL },
          { ...DEFAULT_SETTINGS, signupEmail: false },
        ),
      /Sign-in method disabled: email/,
    );
  });

  it("does not let ADMIN_EMAILS members bypass a disabled email sign-in", () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "ops@example.test";
    try {
      assert.throws(
        () =>
          enforceSignInMethod(
            "/sign-in/email",
            { email: "Ops@Example.test" },
            { ...DEFAULT_SETTINGS, signupEmail: false },
          ),
        /Sign-in method disabled: email/,
      );
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previous;
    }
  });

  it("does not treat the legacy mailbox as an admin sign-in bypass", () => {
    assert.throws(
      () =>
        enforceSignInMethod(
          "/sign-in/email",
          { email: LEGACY_ADMIN_EMAIL },
          { ...DEFAULT_SETTINGS, signupEmail: false },
        ),
      /Sign-in method disabled: email/,
    );
  });

  it("does not allow other users to sign in by email when email is disabled", () => {
    assert.throws(
      () =>
        enforceSignInMethod(
          "/sign-in/email",
          { email: "user@example.com" },
          { ...DEFAULT_SETTINGS, signupEmail: false },
        ),
      /Sign-in method disabled: email/,
    );
  });

  it("denies unknown provider ids instead of treating them as X", () => {
    assert.throws(
      () =>
        enforceSignInMethod(
          "/oauth2/link",
          { providerId: "provider-not-configured" },
          DEFAULT_SETTINGS,
        ),
      /Sign-in method disabled: unknown/,
    );
  });
});
