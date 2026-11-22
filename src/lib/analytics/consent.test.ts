import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bootAnalytics, resetAnalyticsBoot } from "./boot.ts";
import { posthogInitConfig } from "./config.ts";
import { CONSENT_GRANTED, shouldLoadAnalytics } from "./consent.ts";
import { resetAnalyticsForTests, track, type AnalyticsClient } from "./runtime.ts";

afterEach(() => {
  resetAnalyticsBoot();
  resetAnalyticsForTests();
});

describe("analytics consent gate", () => {
  it("does not load or call /ingest without consent, even when the key is set", async () => {
    assert.equal(shouldLoadAnalytics("phc_test", null), false);
    assert.equal(shouldLoadAnalytics("phc_test", "denied"), false);
    assert.equal(shouldLoadAnalytics("phc_test", ""), false);
    assert.equal(shouldLoadAnalytics("", CONSENT_GRANTED), false);

    const loads: string[] = [];
    const fetches: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetches.push(url);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    try {
      const loaded = await bootAnalytics({
        key: "phc_test",
        consent: null,
        load: async () => {
          loads.push("posthog-js");
          throw new Error("import should not run");
        },
      });
      assert.equal(loaded, false);
      assert.deepEqual(loads, []);
      assert.deepEqual(
        fetches.filter((url) => url.includes("/ingest")),
        [],
      );
      track("look_saved");
      assert.deepEqual(fetches, []);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("loads only when the key and granted consent are both set", async () => {
    const inits: Array<{ token: string; config: ReturnType<typeof posthogInitConfig> }> = [];
    const client: AnalyticsClient = {
      init(token, config) {
        inits.push({ token, config: config as ReturnType<typeof posthogInitConfig> });
      },
      capture() {},
      identify() {},
      reset() {},
    };
    let imports = 0;
    const loaded = await bootAnalytics({
      key: " phc_live ",
      consent: CONSENT_GRANTED,
      load: async () => {
        imports += 1;
        return client;
      },
    });
    assert.equal(loaded, true);
    assert.equal(imports, 1);
    assert.equal(inits[0]?.token, "phc_live");
    assert.equal(inits[0]?.config.api_host, "/ingest");
    assert.equal(inits[0]?.config.ui_host, "https://eu.posthog.com");
    assert.equal(inits[0]?.config.persistence, "localStorage+cookie");
    assert.equal(inits[0]?.config.autocapture, false);
    assert.equal(inits[0]?.config.capture_exceptions, true);
    assert.equal(inits[0]?.config.disable_session_recording, true);
    assert.equal(inits[0]?.config.ip, false);
    assert.deepEqual(inits[0]?.config.capture_performance.web_vitals_allowed_metrics, ["LCP", "INP", "CLS", "FCP"]);
    const again = await bootAnalytics({
      key: "phc_live",
      consent: CONSENT_GRANTED,
      load: async () => {
        imports += 1;
        return client;
      },
    });
    assert.equal(again, true);
    assert.equal(imports, 1);
  });

  it("keeps memory persistence for the pre-consent config", () => {
    assert.equal(posthogInitConfig(false).persistence, "memory");
  });
});
