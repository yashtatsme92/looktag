import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NATIVE_APP_SCHEME,
  bearerFromHeaders,
  bearerOnlyHeaders,
  isRegisteredLooktagCallback,
  isRegisteredRedirectUri,
  nativeTrustedOrigins,
} from "./native.ts";

const B = "Bearer";

describe("native auth helpers", () => {
  it("trusts the native deep-link scheme", () => {
    assert.equal(NATIVE_APP_SCHEME, "looktag");
    assert.ok(nativeTrustedOrigins.includes("looktag://"));
    assert.ok(nativeTrustedOrigins.includes("looktag://*"));
  });

  it("allows only the registered looktag callback paths", () => {
    assert.equal(isRegisteredLooktagCallback("looktag://"), true);
    assert.equal(isRegisteredLooktagCallback("looktag:///"), true);
    assert.equal(isRegisteredLooktagCallback("looktag://?cookie=abc"), true);
    assert.equal(isRegisteredLooktagCallback("looktag://callback"), false);
    assert.equal(isRegisteredLooktagCallback("looktag:///callback"), false);
    assert.equal(isRegisteredLooktagCallback("looktag://evil/path"), false);
    assert.equal(isRegisteredLooktagCallback("https://looktag"), false);
  });

  it("checks redirect_uri against the registered redirect URIs", () => {
    const origin = "http://127.0.0.1:8080";
    assert.equal(isRegisteredRedirectUri(`${origin}/api/auth/callback/google`, origin), true);
    assert.equal(isRegisteredRedirectUri(`${origin}/api/auth/callback/apple`, origin), true);
    assert.equal(isRegisteredRedirectUri("looktag://", origin), true);
    assert.equal(isRegisteredRedirectUri("looktag:///", origin), true);
    assert.equal(isRegisteredRedirectUri("looktag://callback", origin), false);
    assert.equal(isRegisteredRedirectUri(`${origin}/api/auth/callback/google/extra`, origin), false);
    assert.equal(isRegisteredRedirectUri(`${origin}/api/auth/callback/evil`, origin), false);
    assert.equal(isRegisteredRedirectUri("https://evil.example/api/auth/callback/google", origin), false);
    assert.equal(isRegisteredRedirectUri(`${origin}/api/auth/callback/google?next=/`, origin), false);
  });

  it("bearerFromHeaders reads the token case-insensitively", () => {
    assert.equal(bearerFromHeaders(new Headers({ authorization: `${B} abc.def` })), "abc.def");
    assert.equal(bearerFromHeaders(new Headers({ authorization: "bearer  tok " })), "tok");
  });

  it("bearerFromHeaders ignores missing, empty and non-bearer values", () => {
    assert.equal(bearerFromHeaders(new Headers()), null);
    assert.equal(bearerFromHeaders(new Headers({ authorization: `${B} ` })), null);
    assert.equal(bearerFromHeaders(new Headers({ authorization: "Basic abc" })), null);
  });

  it("bearerOnlyHeaders drops cookies and keeps the token", () => {
    const source = new Headers({
      cookie: "__Host-grok-auth.session_token=victim",
      authorization: `${B} forged`,
      origin: "https://app.example",
    });
    const out = bearerOnlyHeaders(source, "real");
    assert.equal(out.get("cookie"), null);
    assert.equal(out.get("authorization"), `${B} real`);
    assert.equal(out.get("origin"), "https://app.example");
    assert.ok(source.get("cookie"), "input headers are not mutated");
  });
});
