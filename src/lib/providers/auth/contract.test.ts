import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appleOriginNeeded, socialProviders } from "./social.ts";

describe("auth social provider", () => {
  it("includes a vendor only when both credentials are set", () => {
    assert.deepEqual(socialProviders({}), {});
    assert.equal(appleOriginNeeded({}), false);
    assert.deepEqual(
      socialProviders({ GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }),
      { google: { clientId: "gid", clientSecret: "gsec" } },
    );
    const apple = socialProviders({
      APPLE_CLIENT_ID: "aid",
      APPLE_CLIENT_SECRET: "asec",
      APPLE_APP_BUNDLE_IDENTIFIER: "app.looktag",
    });
    assert.deepEqual(apple.apple, {
      clientId: "aid",
      clientSecret: "asec",
      appBundleIdentifier: "app.looktag",
    });
    assert.equal(
      appleOriginNeeded({ APPLE_CLIENT_ID: "aid", APPLE_CLIENT_SECRET: "asec" }),
      true,
    );
  });
});
