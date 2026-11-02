import { test } from "node:test";
import assert from "node:assert/strict";
import { FIND_PIECES_COPY, findPiecesState, isAiQuotaError, isAiUnavailableMessage } from "./find-pieces.ts";

const base = { aiAvailable: true, authEnabled: true, signedIn: true, quotaHit: false };

test("signed-in + AI on + under quota is free", () => {
  assert.equal(findPiecesState(base), "free");
});

test("guest + AI on is gated with Sign in to find pieces", () => {
  assert.equal(findPiecesState({ ...base, signedIn: false }), "gated");
  assert.equal(FIND_PIECES_COPY.gatedTitle, "Sign in to find pieces");
});

test("AI off is unavailable for guests and members", () => {
  assert.equal(findPiecesState({ ...base, aiAvailable: false }), "unavailable");
  assert.equal(findPiecesState({ ...base, aiAvailable: false, signedIn: false }), "unavailable");
  assert.equal(findPiecesState({ ...base, providerError: true }), "unavailable");
  assert.equal(FIND_PIECES_COPY.unavailable, "AI find isn’t available right now.");
});

test("over quota is quota, never unavailable", () => {
  assert.equal(findPiecesState({ ...base, quotaHit: true }), "quota");
});

test("unknown status stays enabled", () => {
  assert.equal(findPiecesState({ ...base, aiAvailable: null }), "free");
});

test("auth disabled never gates", () => {
  assert.equal(findPiecesState({ ...base, authEnabled: false, signedIn: false }), "free");
});

test("error classifiers", () => {
  assert.ok(isAiQuotaError({ status: 429 }));
  assert.ok(isAiQuotaError(new Error("Too many AI searches. Try again later.")));
  assert.ok(!isAiQuotaError(new Error("Unauthorized")));
  assert.ok(isAiUnavailableMessage("AI is not available in this environment."));
  assert.ok(!FIND_PIECES_COPY.gatedTitle.toLowerCase().includes("free"));
});
