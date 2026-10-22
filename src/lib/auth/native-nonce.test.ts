import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowNativeNonceIssue,
  nativeNonceClientKey,
  nativeNonceConsumeAllowed,
  nativeNonceIdentifier,
  nativeNoncePhase,
  nativeNonceRegistrationAllowed,
  tombstoneNonce,
} from "./native-nonce.ts";

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

  it("drops expired keys and stays within the map cap", () => {
    const store = new Map<string, number[]>([
      ["old", [0]],
      ["fresh", [50_000]],
    ]);
    assert.equal(allowNativeNonceIssue("new", 70_000, 2, 60_000, store, 8), true);
    assert.equal(store.has("old"), false);
    assert.equal(store.has("fresh"), true);
    assert.equal(store.has("new"), true);

    const capped = new Map<string, number[]>([
      ["a", [1_000]],
      ["b", [1_000]],
    ]);
    assert.equal(allowNativeNonceIssue("c", 1_100, 2, 60_000, capped, 2), true);
    assert.equal(capped.has("a"), false);
    assert.equal(capped.has("c"), true);
    assert.equal(capped.size, 2);
    assert.equal(allowNativeNonceIssue("b", 1_200, 2, 60_000, capped, 2), true);
    assert.equal(capped.has("b"), true);
  });
});

describe("native nonce tombstone", () => {
  const now = 1_000_000;
  const expiresAt = now + 10 * 60 * 1000;

  it("keeps the original expiry and blocks register and consume", () => {
    const live = { value: "oauth-state", expiresAt };
    assert.equal(nativeNoncePhase(live, now), "live");
    assert.equal(nativeNonceRegistrationAllowed("live"), false);
    assert.equal(nativeNonceConsumeAllowed("live"), true);

    const tombstone = tombstoneNonce(live);
    assert.equal(tombstone.value, "used");
    assert.equal(tombstone.expiresAt, live.expiresAt);
    assert.equal(nativeNoncePhase(tombstone, now), "used");
    assert.equal(nativeNonceRegistrationAllowed("used"), false);
    assert.equal(nativeNonceConsumeAllowed("used"), false);

    assert.equal(nativeNoncePhase(tombstone, expiresAt), "expired");
    assert.equal(nativeNonceRegistrationAllowed("expired"), true);
    assert.equal(nativeNonceConsumeAllowed("expired"), false);
    assert.equal(nativeNoncePhase(null, now), "absent");
    assert.equal(nativeNonceRegistrationAllowed("absent"), true);
  });
});

describe("native nonce client key", () => {
  it("trusts only the hop our proxy appends, otherwise the socket", () => {
    assert.equal(
      nativeNonceClientKey({
        forwardedFor: "1.2.3.4, 203.0.113.8",
        socketAddress: "10.0.0.4",
      }),
      "203.0.113.8",
    );
    assert.equal(
      nativeNonceClientKey({
        forwardedFor: "1.2.3.4",
        socketAddress: "203.0.113.9",
      }),
      "203.0.113.9",
    );
    assert.equal(
      nativeNonceClientKey({
        forwardedFor: "198.51.100.2",
        socketAddress: null,
      }),
      "direct",
    );
    assert.equal(
      nativeNonceClientKey({
        forwardedFor: null,
        socketAddress: "192.168.1.9",
      }),
      "192.168.1.9",
    );
    assert.equal(
      nativeNonceClientKey({
        forwardedFor: "not-an-ip, ::ffff:198.51.100.20",
        socketAddress: "::1",
      }),
      "198.51.100.20",
    );
  });
});
