import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HSTS_VALUE, canonicalRedirect, hstsHeader, publicHost } from "./edge.ts";

const APP = { APP_URL: "https://thelooktag.com" };

describe("HSTS", () => {
  it("sent on https when APP_URL is https", () => {
    assert.equal(hstsHeader(APP, new URL("http://internal:10000/"), "https"), HSTS_VALUE);
    assert.equal(hstsHeader(APP, new URL("https://thelooktag.com/"), null), HSTS_VALUE);
  });
  it("not sent on plain http or without an https APP_URL", () => {
    assert.equal(hstsHeader(APP, new URL("http://thelooktag.com/"), "http"), "");
    assert.equal(hstsHeader({}, new URL("https://x.com/"), "https"), "");
    assert.equal(hstsHeader({ APP_URL: "http://localhost:8080" }, new URL("https://x/"), "https"), "");
  });
});

describe("canonical redirect", () => {
  const env = { ...APP, TRUSTED_ORIGINS: "https://looktag.onrender.com", SITE_REDIRECT_TO_CANONICAL: "1" };
  it("is off unless SITE_REDIRECT_TO_CANONICAL=1", () => {
    assert.equal(canonicalRedirect(APP, new URL("https://looktag.onrender.com/looks/a"), "looktag.onrender.com"), "");
  });
  it("redirects other hosts keeping path and query", () => {
    assert.equal(
      canonicalRedirect(env, new URL("https://looktag.onrender.com/looks/a?x=1"), "looktag.onrender.com"),
      "https://thelooktag.com/looks/a?x=1",
    );
  });
  it("redirects looktag.onrender.com and any other host to the canonical origin", () => {
    assert.equal(
      canonicalRedirect(env, new URL("https://looktag.onrender.com/"), "looktag.onrender.com"),
      "https://thelooktag.com/",
    );
    assert.equal(
      canonicalRedirect(env, new URL("https://preview.example/looks/a?x=1"), "preview.example"),
      "https://thelooktag.com/looks/a?x=1",
    );
  });
  it("leaves /api/version and Render health checks on the requested host", () => {
    assert.equal(canonicalRedirect(env, new URL("https://looktag.onrender.com/api/version"), "looktag.onrender.com"), "");
    assert.equal(canonicalRedirect(env, new URL("https://looktag.onrender.com/api/auth/ok"), "looktag.onrender.com"), "");
    assert.equal(canonicalRedirect(env, new URL("https://looktag.onrender.com/api/v1/looks"), "looktag.onrender.com"), "");
  });
  it("never redirects the canonical host, localhost, or auth on trusted hosts", () => {
    assert.equal(canonicalRedirect(env, new URL("https://thelooktag.com/"), "thelooktag.com"), "");
    assert.equal(canonicalRedirect(env, new URL("http://localhost:8080/"), "localhost:8080"), "");
    assert.equal(
      canonicalRedirect(env, new URL("https://looktag.onrender.com/api/auth/callback/google"), "looktag.onrender.com"),
      "",
    );
  });
});

describe("public host", () => {
  it("prefers APP_URL over the request host", () => {
    assert.equal(publicHost(APP, "looktag.onrender.com"), "thelooktag.com");
    assert.equal(publicHost({}, "localhost:8080"), "localhost:8080");
  });
});
