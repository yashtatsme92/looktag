import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProfileFields } from "./profile.ts";

describe("parseProfileFields", () => {
  it("keeps the name, handle, email, and city from registration", () => {
    const parsed = parseProfileFields({
      name: " Ada ",
      email: "Ada@Looktag.test",
      handle: "Ada-Looks",
      city: " Lisbon ",
      bio: " Tailoring on film. ",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.name, "Ada");
      assert.equal(parsed.value.email, "ada@looktag.test");
      assert.equal(parsed.value.handle, "ada-looks");
      assert.equal(parsed.value.city, "Lisbon");
      assert.equal(parsed.value.bio, "Tailoring on film.");
      assert.equal(parsed.value.newPassword, "");
    }
  });

  it("maps the admin alias", () => {
    const parsed = parseProfileFields({ name: "Admin", email: "admin", handle: "studio-admin" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.email, "admin@looktag.studio");
  });

  it("rejects a blank name or a bad email", () => {
    assert.equal(parseProfileFields({ name: "A", email: "a@b.co", handle: "ada" }).ok, false);
    assert.equal(parseProfileFields({ name: "Ada", email: "not-an-email", handle: "ada" }).ok, false);
  });

  it("rejects a reserved or invalid handle", () => {
    assert.equal(parseProfileFields({ name: "Ada", email: "ada@x.co", handle: "admin" }).ok, false);
    assert.equal(parseProfileFields({ name: "Ada", email: "ada@x.co", handle: "a" }).ok, false);
    assert.equal(parseProfileFields({ name: "Ada", email: "ada@x.co", handle: "Ada Looks!" }).ok, false);
  });

  it("requires eight characters when a new password is set", () => {
    assert.equal(
      parseProfileFields({ name: "Ada", email: "ada@x.co", handle: "ada", newPassword: "short" }).ok,
      false,
    );
    const parsed = parseProfileFields({
      name: "Ada",
      email: "ada@x.co",
      handle: "ada",
      newPassword: "password1",
    });
    assert.equal(parsed.ok, true);
  });
});
