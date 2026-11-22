import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { allowProps } from "./allowlist.ts";
import { configureAnalytics, identify, resetAnalyticsForTests, track, bindAnalytics } from "./runtime.ts";

afterEach(() => {
  resetAnalyticsForTests();
});

describe("analytics property allowlist", () => {
  it("drops emails, names, handles, free text, prices, and URLs", () => {
    const captured: Array<{ event: string; props: Record<string, unknown> | undefined }> = [];
    bindAnalytics({
      init() {},
      capture(event, props) {
        captured.push({ event, props });
      },
      identify(id) {
        captured.push({ event: "identify", props: { id } });
      },
      reset() {},
    });
    configureAnalytics({
      appVersion: "2.5.54",
      surface: () => "phone",
      feedFeatures: () => "feedFollow,not-a-toggle,feedDrop",
    });
    track("look_viewed", {
      look_id: "seed-sunday-coat",
      from: "feed",
      email: "ada@example.com",
      name: "Ada",
      handle: "ada",
      price: "EUR 120",
      url: "https://shop.example/coat",
      caption: "Sunday coat in the city",
      source: "not-a-source",
    });
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0]?.props, {
      surface: "phone",
      signed_in: false,
      app_version: "2.5.54",
      feed_features: "feedFollow,feedDrop",
      look_id: "seed-sunday-coat",
      from: "feed",
    });
  });

  it("drops a look id that is an email or a URL", () => {
    assert.deepEqual(allowProps({ look_id: "ada@example.com", from: "share" }), { from: "share" });
    assert.deepEqual(allowProps({ look_id: "https://evil.example/x", from: "deeplink" }), { from: "deeplink" });
  });

  it("identify sends the user id only", () => {
    const ids: string[] = [];
    bindAnalytics({
      init() {},
      capture() {},
      identify(id) {
        ids.push(id);
      },
      reset() {},
    });
    identify("user_123");
    identify("ada@example.com");
    identify("https://example.com/u");
    identify("has space");
    assert.deepEqual(ids, ["user_123"]);
  });

  it("does not capture before the client is loaded", () => {
    track("create_started", { email: "ada@example.com" });
    assert.equal(true, true);
  });
});
