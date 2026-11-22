import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forwardIngestHeaders, ingestUpstream, proxyIngest } from "./ingest-proxy.ts";

describe("PostHog ingest proxy", () => {
  it("routes static assets and the API on the EU hosts", () => {
    assert.equal(
      ingestUpstream("/ingest/static/array.js", "?v=1"),
      "https://eu-assets.i.posthog.com/static/array.js?v=1",
    );
    assert.equal(ingestUpstream("/ingest/static"), "https://eu-assets.i.posthog.com/static");
    assert.equal(ingestUpstream("/ingest/e/", "?ip=0"), "https://eu.i.posthog.com/e/?ip=0");
    assert.equal(ingestUpstream("/ingest"), "https://eu.i.posthog.com/");
    assert.equal(ingestUpstream("/ingestion"), null);
    assert.equal(ingestUpstream("/ingest/../secret"), null);
  });

  it("forwards body and content-type, and drops cookies and auth headers", async () => {
    const seen: { url: string; headers: Headers; body: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      const body = init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : "";
      seen.push({ url, headers, body });
      return new Response("ok", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "ph=secret",
          "cache-control": "no-store",
        },
      });
    };
    const request = new Request("https://thelooktag.com/ingest/e/?ip=0", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "session=secret",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ event: "look_saved" }),
    });
    const response = await proxyIngest(request, fetchImpl);
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get("content-type"), "application/json");
    assert.equal(response?.headers.get("set-cookie"), null);
    assert.equal(response?.headers.get("cache-control"), "no-store");
    const forwarded = seen[0];
    assert.ok(forwarded);
    assert.equal(forwarded.url, "https://eu.i.posthog.com/e/?ip=0");
    assert.equal(forwarded.headers.get("content-type"), "application/json");
    assert.equal(forwarded.headers.get("cookie"), null);
    assert.equal(forwarded.headers.get("authorization"), null);
    assert.equal(forwarded.body, JSON.stringify({ event: "look_saved" }));
  });

  it("copies content-type only from the allowlisted request headers", () => {
    const headers = new Headers({
      "content-type": "text/plain",
      cookie: "a=b",
      authorization: "Bearer x",
    });
    const forwarded = forwardIngestHeaders(headers);
    assert.equal(forwarded.get("content-type"), "text/plain");
    assert.equal(forwarded.get("cookie"), null);
    assert.equal(forwarded.get("authorization"), null);
  });
});
