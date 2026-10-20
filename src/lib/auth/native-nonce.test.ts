import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowNativeNonceIssue, nativeNonceIdentifier } from "./native-nonce.ts";

describe("native nonce issue limit", () => {
  it("names the one-time row after the nonce", () => {
    assert.equal(nativeNonceIdentifier("abc"), "native-nonce:abc");
  });

  it("allows a burst inside the window and then rejects", () => {
    const store = new Map<string, number[]>();
    assert.equal(allowNativeNonceIssue("client", 1_000, 2, 60_000, store), true);
    assert.equal(allowNativeNonceIssue("client", 1_500, 2, 60_000, store), true);
    assert.equal(allowNativeNonceIssue("client", 2_000, 2, 60_000, store), false);
    assert.equal(allowNativeNonceIssue("other", 2_000, 2, 60_000, store), true);
    assert.equal(allowNativeNonceIssue("client", 61_500, 2, 60_000, store), true);
  });
});
