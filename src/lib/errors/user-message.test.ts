import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FRIENDLY_ERRORS } from "./public-error.ts";
import { looksTechnical, userMessage } from "./user-message.ts";

const FALLBACK = "Could not save the look.";

describe("userMessage", () => {
  it("hides the production S3 error from the toast", () => {
    const raw = new Error(
      "Cannot find package '@aws-sdk/client-s3' imported from /app/.output/server/_ssr/photo-store.server-Bp10sQQL.mjs",
    );
    assert.equal(userMessage(raw, FALLBACK), FALLBACK);
  });

  for (const raw of [
    "connect ECONNREFUSED 127.0.0.1:5432",
    'relation "looks" does not exist',
    "Cannot read properties of undefined (reading 'id')",
    "TypeError: x is not a function",
    "Unexpected token < in JSON at position 0",
    "Invalid storage key",
    'Unknown STORAGE_PROVIDER "gcs". Expected local|s3|r2.',
    "Forbidden: cross-site request blocked",
    "AccessDenied: Access Denied",
    "Internal server error",
    '[{"code":"invalid_type","path":["title"]}]',
    "SELECT id FROM looks WHERE id = $1",
    "aborted",
    "x".repeat(260),
  ]) {
    it(`masks: ${raw.slice(0, 48)}`, () => {
      assert.equal(looksTechnical(raw) || raw.length > 200, true);
      assert.equal(userMessage(new Error(raw), FALLBACK), FALLBACK);
    });
  }

  for (const kept of [
    "Give the look a name.",
    "That handle is already taken.",
    "Use a JPEG, PNG, or WebP photo.",
    "That file is too large. Try one under 12 MB.",
    "Current password is not right.",
    "Your House isn't live yet.",
    "Select a photo from your library.",
    FRIENDLY_ERRORS.photoUpload,
    FRIENDLY_ERRORS.generic,
    "Too many AI searches. Try again later.",
  ]) {
    it(`keeps: ${kept}`, () => {
      assert.equal(userMessage(new Error(kept), FALLBACK), kept);
    });
  }

  it("network failures read as connection problems", () => {
    for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
      assert.equal(userMessage(new TypeError(raw), FALLBACK), FRIENDLY_ERRORS.offline);
    }
  });

  it("Unauthorized becomes a sign-in sentence", () => {
    assert.equal(userMessage(new Error("Unauthorized"), FALLBACK), FRIENDLY_ERRORS.signIn);
  });

  it("empty and non-Error values use the fallback", () => {
    assert.equal(userMessage(undefined, FALLBACK), FALLBACK);
    assert.equal(userMessage(new Error(""), FALLBACK), FALLBACK);
    assert.equal(userMessage({ message: 42 }, FALLBACK), FALLBACK);
    assert.equal(userMessage("Give the look a name.", FALLBACK), "Give the look a name.");
  });
});
