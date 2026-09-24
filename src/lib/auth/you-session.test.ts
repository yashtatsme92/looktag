import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveYouSessionState, youSessionSignedIn } from "./you-session.ts";

describe("resolveYouSessionState", () => {
  it("stays pending while the session is still resolving", () => {
    assert.equal(resolveYouSessionState({ isPending: true, user: null }), "pending");
    assert.equal(
      resolveYouSessionState({
        isPending: true,
        user: { primaryEmail: "admin@looktag.studio" },
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
        user: { primaryEmail: "admin@looktag.studio" },
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
