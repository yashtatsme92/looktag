import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NATIVE_APP_SCHEME,
  bearerFromHeaders,
  bearerOnlyHeaders,
  nativeTrustedOrigins,
} from "./native.ts";

const B = "Bearer";

describe("native auth helpers", () => {
  it("trusts the native deep-link scheme", () => {
    assert.equal(NATIVE_APP_SCHEME, "looktag");
    assert.ok(nativeTrustedOrigins.includes("looktag://"));
    assert.ok(nativeTrustedOrigins.includes("looktag://*"));
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
