import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rejectExpoProxy } from "./expo-proxy.ts";

const origin = "http://127.0.0.1:8080";

function request(target: string, init: { oauthState?: string; site?: string } = {}) {
  const url = new URL("/api/auth/expo-authorization-proxy", origin);
  url.searchParams.set("authorizationURL", target);
  if (init.oauthState) url.searchParams.set("oauthState", init.oauthState);
  return new Request(url, {
    headers: init.site ? { "sec-fetch-site": init.site } : undefined,
  });
}

describe("expo authorization proxy", () => {
  it("allows Google and Apple authorize hosts and the registered looktag callbacks", () => {
    const google = `https://accounts.google.com/o/oauth2/v2/auth?state=abc&redirect_uri=${encodeURIComponent("looktag://")}`;
    const apple = `https://appleid.apple.com/auth/authorize?state=abc&redirect_uri=${encodeURIComponent(`${origin}/api/auth/callback/apple`)}`;
    assert.equal(rejectExpoProxy(request(google)), null);
    assert.equal(rejectExpoProxy(request(apple)), null);
    const callback = rejectExpoProxy(request("looktag://"));
    assert.equal(callback?.status, 302);
    assert.equal(callback?.headers.get("location"), "looktag://");
    assert.equal(rejectExpoProxy(request("looktag:///"))?.status, 302);
  });

  it("rejects other hosts, unregistered looktag paths, a loose redirect_uri, oauth state, and cross-site requests", () => {
    assert.equal(rejectExpoProxy(request("https://evil.example/phish?state=abc"))?.status, 400);
    assert.equal(rejectExpoProxy(request("looktag://callback"))?.status, 400);
    assert.equal(rejectExpoProxy(request("looktag:///steal"))?.status, 400);
    assert.equal(
      rejectExpoProxy(request("https://accounts.google.com/o/oauth2/v2/auth?state=abc"))?.status,
      400,
    );
    assert.equal(
      rejectExpoProxy(
        request(
          `https://accounts.google.com/o/oauth2/v2/auth?state=abc&redirect_uri=${encodeURIComponent("looktag://callback")}`,
        ),
      )?.status,
      400,
    );
    assert.equal(
      rejectExpoProxy(request("https://accounts.google.com/o/oauth2/v2/auth?state=abc&redirect_uri=https://evil.example/cb"))?.status,
      400,
    );
    assert.equal(
      rejectExpoProxy(
        request(
          `https://accounts.google.com/o/oauth2/v2/auth?state=abc&redirect_uri=${encodeURIComponent(`${origin}/api/auth/callback/google/extra`)}`,
        ),
      )?.status,
      400,
    );
    assert.equal(
      rejectExpoProxy(request("https://accounts.google.com/o/oauth2/v2/auth?state=abc", { oauthState: "attacker" }))?.status,
      400,
    );
    assert.equal(
      rejectExpoProxy(request("https://accounts.google.com/o/oauth2/v2/auth?state=abc", { site: "cross-site" }))?.status,
      403,
    );
    assert.equal(
      rejectExpoProxy(request("looktag://", { site: "same-site" }))?.status,
      403,
    );
  });
});
