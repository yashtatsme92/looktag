import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FRIENDLY_ERRORS, PublicError, isPublicError, toClientError } from "./public-error.ts";

describe("toClientError", () => {
  it("masks an internal error like the missing S3 SDK", () => {
    const raw = new Error(
      "Cannot find package '@aws-sdk/client-s3' imported from /app/.output/server/_ssr/photo-store.server-Bp10sQQL.mjs",
    );
    const out = toClientError(raw, "ab12cd34") as PublicError & { ref?: string };
    assert.ok(out instanceof PublicError);
    assert.equal(out.message, FRIENDLY_ERRORS.generic);
    assert.equal(out.ref, "ab12cd34");
    assert.doesNotMatch(out.message, /aws|\/app\//);
  });

  it("keeps user-meaningful errors", () => {
    const err = new PublicError("Give the look a name.");
    assert.equal(toClientError(err, "x"), err);
  });

  it("drops the internal cause from a wrapped public error", () => {
    const cause = new Error("Cannot find package '@aws-sdk/client-s3' imported from /app/x.mjs");
    const wrapped = new PublicError(FRIENDLY_ERRORS.photoUpload, { status: 503, cause });
    const out = toClientError(wrapped, "x") as PublicError;
    assert.notEqual(out, wrapped);
    assert.equal(out.message, FRIENDLY_ERRORS.photoUpload);
    assert.equal(out.status, 503);
    assert.equal(out.cause, undefined);
  });

  it("keeps the Unauthorized contract and rate limits", () => {
    const unauthorized = Object.assign(new Error("Unauthorized"), { name: "UnauthorizedError" });
    assert.equal(toClientError(unauthorized, "x"), unauthorized);
    const limited = Object.assign(new Error("Too many AI searches. Try again later."), { name: "RateLimitError" });
    assert.equal(toClientError(limited, "x"), limited);
  });

  it("turns Forbidden into a sentence", () => {
    const err = Object.assign(new Error("Forbidden: cross-site request blocked"), { name: "CrossSiteRequestError" });
    const out = toClientError(err, "x") as Error;
    assert.equal(out.message, FRIENDLY_ERRORS.forbidden);
  });

  it("passes redirects, notFound and Responses through", () => {
    const redirect = { isRedirect: true, options: { to: "/login" } };
    const notFound = { isNotFound: true };
    const response = new Response(null, { status: 302 });
    assert.equal(toClientError(redirect, "x"), redirect);
    assert.equal(toClientError(notFound, "x"), notFound);
    assert.equal(toClientError(response, "x"), response);
  });

  it("masks plain Errors and non-Error throws", () => {
    assert.equal(isPublicError(new Error("relation \"looks\" does not exist")), false);
    assert.equal((toClientError("boom", "x") as Error).message, FRIENDLY_ERRORS.generic);
  });

  it("the photo upload message is the friendly one", () => {
    assert.equal(FRIENDLY_ERRORS.photoUpload, "We couldn't upload your photo right now. Please try again in a moment.");
  });
});
