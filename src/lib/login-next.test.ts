import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureSessionToken,
  loginScreenStuck,
  postAuthPath,
  safeNext,
  withTimeout,
} from "./login-next.ts";

describe("safeNext", () => {
  it("allows in-app paths", () => {
    assert.equal(safeNext("/create"), "/create");
    assert.equal(safeNext("/looks/abc"), "/looks/abc");
  });

  it("rejects open redirects and auth loops", () => {
    assert.equal(safeNext("//evil.test"), undefined);
    assert.equal(safeNext("https://evil.test"), undefined);
    assert.equal(safeNext("/login"), undefined);
    assert.equal(safeNext("/login?next=/create"), undefined);
    assert.equal(safeNext(""), undefined);
    assert.equal(safeNext(1), undefined);
  });
});

describe("postAuthPath", () => {
  it("falls back to home", () => {
    assert.equal(postAuthPath(undefined), "/");
    assert.equal(postAuthPath("/login"), "/");
    assert.equal(postAuthPath("/create"), "/create");
  });

  it("accepts a custom fallback for after-auth", () => {
    assert.equal(postAuthPath(undefined, "/login"), "/login");
    assert.equal(postAuthPath("/create", "/login"), "/create");
  });
});

describe("loginScreenStuck", () => {
  it("flags a login page that never leaves the pending skeleton", () => {
    assert.equal(
      loginScreenStuck({ path: "/login", isPending: true, hasForm: false, elapsedMs: 5000 }),
      true,
    );
    assert.equal(
      loginScreenStuck({ path: "/login", isPending: true, hasForm: true, elapsedMs: 5000 }),
      false,
    );
    assert.equal(
      loginScreenStuck({ path: "/login", isPending: true, hasForm: false, elapsedMs: 200 }),
      false,
    );
  });
});

describe("captureSessionToken", () => {
  it("rejects empty tokens", () => {
    assert.equal(captureSessionToken(""), false);
    assert.equal(captureSessionToken(null), false);
    assert.equal(captureSessionToken(1), false);
  });
});

describe("withTimeout", () => {
  it("returns the fallback when the promise never settles", async () => {
    const value = await withTimeout(new Promise<string>(() => {}), 20, "fallback");
    assert.equal(value, "fallback");
  });

  it("returns the resolved value when it wins the race", async () => {
    const value = await withTimeout(Promise.resolve("ok"), 200, "fallback");
    assert.equal(value, "ok");
  });
});
