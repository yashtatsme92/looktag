import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_EMAIL,
  isAdminEmail,
  normalizeLoginEmail,
  resolveYouSessionState,
  resolveAdminEmail,
  resolveBootstrapPassword,
  shouldBootstrapAdmin,
  youSessionSignedIn,
} from "./access.ts";

describe("normalizeLoginEmail", () => {
  it("maps the admin alias to the seeded address", () => {
    assert.equal(normalizeLoginEmail("admin"), ADMIN_EMAIL);
    assert.equal(normalizeLoginEmail("Admin"), ADMIN_EMAIL);
    assert.equal(normalizeLoginEmail("  ADMIN  "), ADMIN_EMAIL);
  });

  it("leaves other emails untouched besides trim", () => {
    assert.equal(normalizeLoginEmail("  you@email.com "), "you@email.com");
  });
});

describe("isAdminEmail", () => {
  it("accepts the alias and the seeded address", () => {
    assert.equal(isAdminEmail("admin"), true);
    assert.equal(isAdminEmail(ADMIN_EMAIL), true);
    assert.equal(isAdminEmail("Admin@Looktag.Studio"), true);
    assert.equal(isAdminEmail("you@email.com"), false);
    assert.equal(isAdminEmail(null), false);
  });
});

describe("resolveYouSessionState", () => {
  it("stays pending while the session is still resolving", () => {
    assert.equal(resolveYouSessionState({ isPending: true, user: null }), "pending");
    assert.equal(
      resolveYouSessionState({
        isPending: true,
        user: { primaryEmail: ADMIN_EMAIL },
      }),
      "pending",
    );
  });

  it("treats a resolved null session as guest", () => {
    assert.equal(resolveYouSessionState({ isPending: false, user: null }), "guest");
  });

  it("treats regular accounts as members", () => {
    assert.equal(
      resolveYouSessionState({
        isPending: false,
        user: { primaryEmail: "creator@example.com" },
      }),
      "member",
    );
  });

  it("marks the system account as admin", () => {
    assert.equal(
      resolveYouSessionState({
        isPending: false,
        user: { primaryEmail: ADMIN_EMAIL },
      }),
      "admin",
    );
  });
});

describe("youSessionSignedIn", () => {
  it("only returns true for settled signed-in states", () => {
    assert.equal(youSessionSignedIn("pending"), false);
    assert.equal(youSessionSignedIn("guest"), false);
    assert.equal(youSessionSignedIn("member"), true);
    assert.equal(youSessionSignedIn("admin"), true);
  });
});

describe("admin bootstrap env", () => {
  it("resolves admin email from env or the default", () => {
    assert.equal(resolveAdminEmail({}), ADMIN_EMAIL);
    assert.equal(
      resolveAdminEmail({ ADMIN_EMAIL: " ops@example.com " }),
      "ops@example.com",
    );
  });

  it("never bootstraps without ADMIN_BOOTSTRAP_PASSWORD", () => {
    assert.equal(shouldBootstrapAdmin({}), false);
    assert.equal(shouldBootstrapAdmin({ ADMIN_BOOTSTRAP: "1" }), false);
    assert.equal(
      shouldBootstrapAdmin({ NODE_ENV: "production", ADMIN_BOOTSTRAP: "true" }),
      false,
    );
  });

  it("allows non-production bootstrap when a password is set", () => {
    assert.equal(
      shouldBootstrapAdmin({ ADMIN_BOOTSTRAP_PASSWORD: "s3cret" }),
      true,
    );
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "development",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      true,
    );
  });

  it("requires an explicit flag in production", () => {
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "production",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      false,
    );
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "production",
        ADMIN_BOOTSTRAP: "1",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      true,
    );
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "production",
        ADMIN_BOOTSTRAP: "yes",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      true,
    );
  });

  it("reads the bootstrap password from env only", () => {
    assert.equal(resolveBootstrapPassword({}), undefined);
    assert.equal(
      resolveBootstrapPassword({ ADMIN_BOOTSTRAP_PASSWORD: "  s3cret  " }),
      "s3cret",
    );
  });
});
