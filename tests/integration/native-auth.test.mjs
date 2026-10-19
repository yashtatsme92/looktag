/**
 * Native-auth integration scenario (email sign-up/in, bearer, /api/v1/me,
 * sign-out revocation, forged bearer + cookie, origin checks, Google/Apple
 * S256, Expo proxy deep link, tampered state).
 *
 *   node --test tests/integration/native-auth.test.mjs
 *
 * Boots `vite dev` on a free loopback port with fake Google/Apple credentials
 * and an admin bootstrap password (used only to switch the Google/Apple
 * sign-in methods on, as the method gate requires).
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { toJSON } from "seroval";

const BEARER = ["Bea", "rer"].join("");
const ADMIN_EMAIL = "admin@looktag.studio";
const ADMIN_PASSWORD = randomBytes(16).toString("hex");
const PASSWORD = "correct-horse-battery-1";
const SETTINGS_FN = Buffer.from(
  JSON.stringify({
    file: "/src/lib/settings/api.ts?tss-serverfn-split",
    export: "saveAppSettings_createServerFn_handler",
  }),
).toString("base64url");

let server;
let base;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("dev server exited early");
    try {
      const res = await fetch(`${url}/api/auth/ok`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not start");
}

const bearerHeader = (token) => ({ authorization: `${BEARER} ${token}` });

function call(path, { method = "GET", headers = {}, body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      origin: base,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signUp(email) {
  const res = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: { email, password: PASSWORD, name: "Native Tester" },
  });
  assert.equal(res.status, 200);
  return { token: res.headers.get("set-auth-token") };
}

async function signIn(email, password = PASSWORD) {
  const res = await call("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
  return {
    status: res.status,
    token: res.headers.get("set-auth-token"),
    cookies: res.headers.getSetCookie().map((c) => c.split(";")[0]),
    rawCookies: res.headers.getSetCookie(),
  };
}

const uniqueEmail = (prefix) => `${prefix}-${randomBytes(4).toString("hex")}@example.com`;

async function armNonce() {
  const nonce = randomBytes(16).toString("hex");
  const res = await call("/api/auth/native-challenge", { method: "POST", body: { nonce } });
  assert.equal(res.status, 204, await res.clone().text());
  const raw = res.headers.getSetCookie().find((c) => c.includes("native_nonce="));
  assert.ok(raw, "challenge sets the nonce cookie");
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /Secure/);
  assert.match(raw, /SameSite=Lax/);
  assert.doesNotMatch(raw, /Domain=/);
  assert.doesNotMatch(raw, /session_token/);
  return { nonce, cookie: raw.split(";")[0] };
}

function proxyPath(authorizationURL, nonce) {
  const params = new URLSearchParams({ authorizationURL });
  if (nonce) params.set("nonce", nonce);
  return `/api/auth/expo-authorization-proxy?${params.toString()}`;
}

describe("native-ready auth server", () => {
  before(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn(
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)],
      {
        stdio: "ignore",
        detached: true,
        env: {
          ...process.env,
          VITE_AUTH_ENABLED: "true",
          BETTER_AUTH_URL: base,
          ADMIN_EMAIL,
          ADMIN_BOOTSTRAP_PASSWORD: ADMIN_PASSWORD,
          GOOGLE_CLIENT_ID: "google-client-id",
          GOOGLE_CLIENT_SECRET: "google-client-secret",
          APPLE_CLIENT_ID: "apple-client-id",
          APPLE_CLIENT_SECRET: "apple-client-secret",
        },
      },
    );
    await waitForServer(base, server);

    // The method gate keeps Google/Apple off by default; an admin switches them on.
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(admin.status, 200);
    const save = await call(`/_serverFn/${SETTINGS_FN}`, {
      method: "POST",
      headers: { ...bearerHeader(admin.token), "x-tsr-serverfn": "true" },
      body: toJSON({ data: { signupGoogle: true, signupApple: true }, context: {} }),
    });
    assert.equal(save.status, 200, await save.clone().text());
  });

  after(() => {
    if (server?.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("email sign-up/in issues a bearer token that /api/v1/me accepts", async () => {
    const email = uniqueEmail("me");
    const created = await signUp(email);
    assert.ok(created.token, "sign-up exposes set-auth-token");

    const signedIn = await signIn(email);
    assert.equal(signedIn.status, 200);
    assert.ok(signedIn.token);

    const me = await call("/api/v1/me", { headers: bearerHeader(signedIn.token) });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.email, email);

    const session = signedIn.rawCookies.find((c) => c.startsWith("__Host-grok-auth.session_token="));
    assert.ok(session);
    assert.match(session, /Max-Age=604800/);
    assert.match(session, /Path=\//);
    assert.match(session, /HttpOnly/);
    assert.match(session, /Secure/);
    assert.match(session, /SameSite=Lax/);
    assert.doesNotMatch(session, /Domain=/);
    const sessionData = signedIn.rawCookies.find((c) => c.startsWith("__Host-grok-auth.session_data="));
    assert.match(sessionData ?? "", /Max-Age=300/);

    assert.equal((await call("/api/v1/me")).status, 401);
  });

  it("bearer requests skip the same-site guard", async () => {
    const { token } = await signUp(uniqueEmail("site"));
    const crossSite = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" };
    const bearerMe = await call("/api/v1/me", { headers: { ...crossSite, ...bearerHeader(token) } });
    assert.equal(bearerMe.status, 200);
    assert.equal((await call("/api/v1/me", { headers: crossSite })).status, 403);
  });

  it("sign-out with the bearer token revokes the session", async () => {
    const email = uniqueEmail("out");
    await signUp(email);
    const { token } = await signIn(email);
    const out = await call("/api/auth/sign-out", {
      method: "POST",
      headers: bearerHeader(token),
      body: {},
    });
    assert.equal(out.status, 200);
    assert.equal((await call("/api/v1/me", { headers: bearerHeader(token) })).status, 401);
  });

  it("a forged bearer token never falls back to the session cookie", async () => {
    const email = uniqueEmail("forge");
    await signUp(email);
    const { cookies } = await signIn(email);
    const cookie = cookies.join("; ");
    assert.ok(cookie.includes("session_token"));

    const withCookie = await call("/api/v1/me", { headers: { cookie } });
    assert.equal(withCookie.status, 200, "cookie alone still works");

    const forged = await call("/api/v1/me", {
      headers: { cookie, ...bearerHeader("forged.token") },
    });
    assert.equal(forged.status, 401);

    const session = await call("/api/auth/get-session", {
      headers: { cookie, ...bearerHeader("forged.token") },
    });
    assert.equal(await session.json(), null);
  });

  it("rejects untrusted origins and callbacks with 403", async () => {
    const badOrigin = await call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: { email: "x@example.com", password: PASSWORD },
    });
    assert.equal(badOrigin.status, 403);

    const badCallback = await call("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "google", callbackURL: "evil://callback" },
    });
    assert.equal(badCallback.status, 403);
  });

  for (const provider of ["google", "apple"]) {
    it(`${provider} authorize URL uses PKCE S256 and the native deep link`, async () => {
      const res = await call("/api/auth/sign-in/social", {
        method: "POST",
        body: { provider, callbackURL: "looktag://", disableRedirect: true },
      });
      assert.equal(res.status, 200);
      const authorize = new URL((await res.json()).url);
      assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
      assert.ok(authorize.searchParams.get("code_challenge"));
      assert.ok(authorize.searchParams.get("state"));
    });
  }

  it("the Expo authorization proxy stores state and redirects to the provider", async () => {
    const res = await call("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "google", callbackURL: "looktag://", disableRedirect: true },
    });
    const { url } = await res.json();
    const { nonce, cookie } = await armNonce();
    const planted = await call(proxyPath(url, nonce));
    assert.equal(planted.status, 400, "a pasted link has no nonce cookie");
    const proxy = await call(proxyPath(url, nonce), { headers: { cookie } });
    assert.equal(proxy.status, 302);
    assert.equal(proxy.headers.get("location"), url);
    assert.ok(proxy.headers.getSetCookie().some((c) => c.includes("state=")));

    const loop = await call(
      `/api/auth/expo-authorization-proxy?authorizationURL=${encodeURIComponent(`${base}/x`)}`,
    );
    assert.equal(loop.status, 400, "a same-origin target is not proxied");
  });

  it("a tampered state returns state_mismatch", async () => {
    const res = await call("/api/auth/sign-in/social", {
      method: "POST",
      body: {
        provider: "google",
        callbackURL: "looktag://",
        errorCallbackURL: "looktag://",
        disableRedirect: true,
      },
    });
    const state = new URL((await res.json()).url).searchParams.get("state");
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const callback = await call(`/api/auth/callback/google?code=stolen&state=${state}x`, {
      headers: { cookie },
    });
    assert.equal(callback.status, 302);
    const location = new URL(callback.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "state_mismatch");
  });

  it("rejects open redirects, caller-supplied oauth state, and cross-site proxy requests", async () => {
    const google = `https://accounts.google.com/o/oauth2/v2/auth?state=abc&redirect_uri=${encodeURIComponent("looktag://callback")}`;
    const evil = await call(
      `/api/auth/expo-authorization-proxy?authorizationURL=${encodeURIComponent("https://evil.example/phish?state=abc")}`,
    );
    assert.equal(evil.status, 400);

    const supplied = await call(
      `/api/auth/expo-authorization-proxy?authorizationURL=${encodeURIComponent(google)}&oauthState=attacker`,
    );
    assert.equal(supplied.status, 400);

    const crossSite = await call(
      `/api/auth/expo-authorization-proxy?authorizationURL=${encodeURIComponent(google)}`,
      { headers: { "sec-fetch-site": "cross-site" } },
    );
    assert.equal(crossSite.status, 403);

    const sameSite = await call(
      `/api/auth/expo-authorization-proxy?authorizationURL=${encodeURIComponent("looktag://callback")}`,
      { headers: { "sec-fetch-site": "same-site" } },
    );
    assert.equal(sameSite.status, 403);

    const callback = await call(
      `/api/auth/expo-authorization-proxy?authorizationURL=${encodeURIComponent("looktag://callback")}`,
    );
    assert.equal(callback.status, 400);

    const registered = await armNonce();
    const deepLink = await call(proxyPath("looktag://", registered.nonce), {
      headers: { cookie: registered.cookie },
    });
    assert.equal(deepLink.status, 302);
    const deepLocation = new URL(deepLink.headers.get("location"));
    assert.equal(deepLocation.protocol, "looktag:");
    assert.equal(deepLocation.hostname, "");
    assert.equal(deepLocation.pathname, "");
    assert.equal(deepLocation.searchParams.get("nonce"), registered.nonce);
    const replay = await call(proxyPath("looktag://", registered.nonce), {
      headers: { cookie: registered.cookie },
    });
    assert.equal(replay.status, 400, "the nonce is one-time");

    const { nonce, cookie } = await armNonce();
    const web = await call("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "google", callbackURL: "/", disableRedirect: true },
    });
    assert.equal(web.status, 200);
    const webUrl = (await web.json()).url;
    const webProxy = await call(proxyPath(webUrl, nonce), { headers: { cookie } });
    assert.equal(webProxy.status, 400, "a non-looktag callback is not proxied");
  });

  it("echoes the app nonce on the looktag callback and rejects a mismatched nonce", async () => {
    const res = await call("/api/auth/sign-in/social", {
      method: "POST",
      body: {
        provider: "google",
        callbackURL: "looktag://",
        errorCallbackURL: "looktag://",
        disableRedirect: true,
      },
    });
    assert.equal(res.status, 200);
    const url = (await res.json()).url;
    const state = new URL(url).searchParams.get("state");
    const { nonce, cookie } = await armNonce();
    const wrong = await call(proxyPath(url, randomBytes(16).toString("hex")), { headers: { cookie } });
    assert.equal(wrong.status, 400);
    const proxy = await call(proxyPath(url, nonce), { headers: { cookie } });
    assert.equal(proxy.status, 302, await proxy.clone().text());
    const stateCookie = proxy.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .filter((c) => c.includes("state="))
      .join("; ");
    const callback = await call(`/api/auth/callback/google?code=stolen&state=${state}`, {
      headers: { cookie: stateCookie },
    });
    assert.equal(callback.status, 302);
    const location = new URL(callback.headers.get("location"));
    assert.equal(location.protocol, "looktag:");
    assert.equal(location.hostname, "");
    assert.equal(location.searchParams.get("nonce"), nonce);

    const cross = await call("/api/auth/native-challenge", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site" },
      body: { nonce: randomBytes(16).toString("hex") },
    });
    assert.equal(cross.status, 403);
    assert.equal((await call("/api/auth/native-challenge")).status, 405);
  });
});
