import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acceptNativeCallback,
  createNativeSignInNonce,
  isStrongNativeNonce,
  looktagProxyLocation,
  nativeAuthorizationProxyUrl,
  nonceEquals,
  withNonceOnLooktag,
} from "./native-callback.ts";

describe("native callback nonce", () => {
  it("creates a nonce the server will accept", () => {
    const nonce = createNativeSignInNonce();
    assert.equal(isStrongNativeNonce(nonce), true);
    assert.equal(nonceEquals(nonce, nonce), true);
  });

  it("rejects low-entropy and short nonces", () => {
    assert.equal(isStrongNativeNonce("a".repeat(32)), false);
    assert.equal(isStrongNativeNonce("a".repeat(16)), false);
    assert.equal(isStrongNativeNonce("abababababababababababababababab"), false);
    assert.equal(isStrongNativeNonce("has space and more padding chars"), false);
    assert.equal(nonceEquals("a".repeat(32), "a".repeat(32)), false);
  });

  it("accepts only the callback that carries the nonce this app created", () => {
    const nonce = createNativeSignInNonce();
    const other = createNativeSignInNonce();
    assert.equal(acceptNativeCallback(`looktag://?nonce=${nonce}&cookie=session`, nonce), true);
    assert.equal(acceptNativeCallback(`looktag:///?nonce=${nonce}`, nonce), true);
    assert.equal(acceptNativeCallback(`looktag://?nonce=${other}`, nonce), false);
    assert.equal(acceptNativeCallback("looktag://?cookie=session", nonce), false);
    assert.equal(acceptNativeCallback("looktag://callback?nonce=" + nonce, nonce), false);
    assert.equal(acceptNativeCallback("https://evil.example/?nonce=" + nonce, nonce), false);
  });

  it("builds a proxy URL that carries the nonce separately from the app cookie jar", () => {
    const nonce = createNativeSignInNonce();
    const proxy = new URL(nativeAuthorizationProxyUrl("https://app.example", "https://accounts.google.com/o/oauth2/v2/auth?state=abc", nonce));
    assert.equal(proxy.origin, "https://app.example");
    assert.equal(proxy.pathname, "/api/auth/expo-authorization-proxy");
    assert.equal(proxy.searchParams.get("nonce"), nonce);
    assert.match(proxy.searchParams.get("authorizationURL") ?? "", /accounts\.google\.com/);
  });

  it("drops passed query on a looktag proxy redirect and keeps only the nonce", () => {
    const nonce = "0123456789abcdef0123456789abcdef";
    const location = new URL(looktagProxyLocation("looktag://?cookie=planted&x=1", nonce));
    assert.equal(location.protocol, "looktag:");
    assert.equal(location.hostname, "");
    assert.equal(location.searchParams.get("nonce"), nonce);
    assert.equal(location.searchParams.get("cookie"), null);
    assert.equal(location.searchParams.get("x"), null);
    assert.equal(new URL(looktagProxyLocation("looktag:///", nonce)).pathname, "/");
  });

  it("keeps the session hand-off on the callback and drops every other query", () => {
    const nonce = "0123456789abcdef0123456789abcdef";
    const stamped = new URL(withNonceOnLooktag("looktag://?cookie=session&next=/admin", nonce));
    assert.equal(stamped.searchParams.get("cookie"), "session");
    assert.equal(stamped.searchParams.get("nonce"), nonce);
    assert.equal(stamped.searchParams.get("next"), null);
    const replaced = new URL(withNonceOnLooktag("looktag://?nonce=kept", nonce));
    assert.equal(replaced.searchParams.get("nonce"), nonce);
    assert.equal(replaced.searchParams.get("kept"), null);
    const error = new URL(withNonceOnLooktag("looktag://?error=state_mismatch&error_description=no", nonce));
    assert.equal(error.searchParams.get("error"), "state_mismatch");
    assert.equal(error.searchParams.get("nonce"), nonce);
  });
});
