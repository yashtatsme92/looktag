import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_EMAIL, isAdminEmail, normalizeLoginEmail } from "./access.ts";

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
