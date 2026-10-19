import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isNativeNonce,
  nativeNonceClearCookie,
  nativeNonceCookieMatches,
  nativeNonceSetCookie,
  readCookie,
  signNativeNonce,
  withNonceOnLooktag,
} from "./native-nonce.ts";

const secret = "test-secret";

describe("native sign-in nonce", () => {
  it("signs a nonce the cookie check accepts once, and rejects a different one", () => {
    const nonce = "a".repeat(32);
    const signed = signNativeNonce(nonce, secret);
    assert.equal(nativeNonceCookieMatches(signed, nonce, secret), true);
    assert.equal(nativeNonceCookieMatches(signed, `${"b".repeat(32)}`, secret), false);
    assert.equal(nativeNonceCookieMatches(null, nonce, secret), false);
    assert.equal(nativeNonceCookieMatches(signed.slice(0, -1) + "x", nonce, secret), false);
    assert.equal(nativeNonceCookieMatches("short", nonce, secret), false);
  });

  it("rejects nonces that cannot safely travel in a cookie", () => {
    assert.equal(isNativeNonce("a".repeat(16)), true);
    assert.equal(isNativeNonce("a".repeat(15)), false);
    assert.equal(isNativeNonce("has space________"), false);
    assert.equal(isNativeNonce("semi;colon-padding"), false);
  });

  it("reads the nonce cookie without touching other cookies", () => {
    const header = "__Host-grok-auth.session_token=victim; __Host-looktag.native_nonce=abc.def";
    assert.equal(readCookie(header, "__Host-looktag.native_nonce"), "abc.def");
    assert.equal(readCookie(header, "__Host-grok-auth.session_token"), "victim");
  });

  it("sets and clears an HttpOnly cookie that is not a session cookie", () => {
    const set = nativeNonceSetCookie("abc.def");
    assert.match(set, /^__Host-looktag\.native_nonce=abc\.def;/);
    assert.match(set, /HttpOnly/);
    assert.match(set, /Secure/);
    assert.match(set, /SameSite=Lax/);
    assert.match(set, /Path=\//);
    assert.doesNotMatch(set, /Domain=/);
    assert.doesNotMatch(set, /session_token/);
    const clear = nativeNonceClearCookie();
    assert.match(clear, /Max-Age=0/);
    assert.match(clear, /HttpOnly/);
  });

  it("echoes the nonce on a looktag callback without dropping the cookie hand-off", () => {
    assert.equal(withNonceOnLooktag("looktag://", "abc"), "looktag://?nonce=abc");
    const stamped = new URL(withNonceOnLooktag("looktag://?cookie=session", "abc"));
    assert.equal(stamped.searchParams.get("cookie"), "session");
    assert.equal(stamped.searchParams.get("nonce"), "abc");
    assert.equal(
      withNonceOnLooktag("looktag://?nonce=kept", "other"),
      "looktag://?nonce=kept",
    );
  });
});
