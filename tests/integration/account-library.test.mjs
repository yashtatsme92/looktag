/**
 * Account library HTTP API: signed out is 401, bearer auth works,
 * and a second PUT does not change the row.
 *
 *   node --test tests/integration/account-library.test.mjs
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

const BEARER = ["Bea", "rer"].join("");
const PASSWORD = "correct-horse-battery-1";
const LOOK_ID = "seed-sunday-coat";
const CREATOR_ID = "seed-maya-chen";
const HOUSE_ID = "label-atelier-noir";

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

function call(path, { method = "GET", headers = {}, body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      origin: base,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const bearerHeader = (token) => ({ authorization: `${BEARER} ${token}` });

async function signUp(email) {
  const res = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: { email, password: PASSWORD, name: "Library Tester" },
  });
  assert.equal(res.status, 200, await res.clone().text());
  const token = res.headers.get("set-auth-token");
  assert.ok(token);
  return token;
}

describe("account library HTTP API", { timeout: 180_000 }, () => {
  before(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        VITE_AUTH_ENABLED: "true",
        BETTER_AUTH_URL: base,
        BETTER_AUTH_SECRET: randomBytes(24).toString("hex"),
        LOOKTAG_ALLOW_EPHEMERAL_DB: "1",
      },
    });
    await waitForServer(base, server);
    const seeded = await call("/api/v1/looks");
    assert.equal(seeded.status, 200);
  });

  after(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  });

  it("returns 401 when signed out and no-store on every answer", async () => {
    const saves = await call("/api/v1/me/saves");
    assert.equal(saves.status, 401);
    assert.equal(saves.headers.get("cache-control"), "no-store");
    assert.deepEqual(await saves.json(), { error: "Unauthorized" });

    const put = await call(`/api/v1/me/saves/${LOOK_ID}`, { method: "PUT" });
    assert.equal(put.status, 401);
    assert.equal(put.headers.get("cache-control"), "no-store");

    const follows = await call("/api/v1/me/follows");
    assert.equal(follows.status, 401);
    assert.equal(follows.headers.get("cache-control"), "no-store");
  });

  it("accepts a bearer token and treats a second PUT as the same save", async () => {
    const token = await signUp(`saves-${randomBytes(4).toString("hex")}@example.com`);
    const headers = bearerHeader(token);

    const missing = await call("/api/v1/me/saves/not-a-look", { method: "PUT", headers });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");

    const first = await call(`/api/v1/me/saves/${LOOK_ID}`, { method: "PUT", headers });
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal(first.headers.get("cache-control"), "no-store");
    const created = await first.json();
    assert.equal(created.saved, true);
    assert.equal(created.lookId, LOOK_ID);

    const second = await call(`/api/v1/me/saves/${LOOK_ID}`, { method: "PUT", headers });
    assert.equal(second.status, 200);
    const again = await second.json();
    assert.equal(again.createdAt, created.createdAt);

    const listed = await call("/api/v1/me/saves", { headers });
    assert.equal(listed.status, 200);
    assert.equal(listed.headers.get("cache-control"), "no-store");
    const body = await listed.json();
    assert.deepEqual(
      body.saves.map((row) => row.lookId),
      [LOOK_ID],
    );

    const removed = await call(`/api/v1/me/saves/${LOOK_ID}`, { method: "DELETE", headers });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { lookId: LOOK_ID, saved: false });
    const againRemoved = await call(`/api/v1/me/saves/${LOOK_ID}`, { method: "DELETE", headers });
    assert.equal(againRemoved.status, 200);
    const after = await call("/api/v1/me/saves", { headers });
    assert.deepEqual(await after.json(), { saves: [] });
  });

  it("follows a creator and a house, and refuses a second identity change", async () => {
    const token = await signUp(`follows-${randomBytes(4).toString("hex")}@example.com`);
    const headers = bearerHeader(token);
    const me = await call("/api/v1/me", { headers });
    assert.equal(me.status, 200);
    const self = (await me.json()).user.id;

    const selfFollow = await call(`/api/v1/me/follows/creators/${self}`, { method: "PUT", headers });
    assert.equal(selfFollow.status, 400);

    const creator = await call(`/api/v1/me/follows/creators/${CREATOR_ID}`, { method: "PUT", headers });
    assert.equal(creator.status, 200, await creator.clone().text());
    const creatorBody = await creator.json();
    const creatorAgain = await call(`/api/v1/me/follows/creators/${CREATOR_ID}`, { method: "PUT", headers });
    assert.equal(creatorAgain.status, 200);
    assert.equal((await creatorAgain.json()).createdAt, creatorBody.createdAt);

    const house = await call(`/api/v1/me/follows/houses/${HOUSE_ID}`, { method: "PUT", headers });
    assert.equal(house.status, 200, await house.clone().text());
    const houseAgain = await call(`/api/v1/me/follows/houses/${HOUSE_ID}`, { method: "PUT", headers });
    assert.equal(houseAgain.status, 200);

    const listed = await call("/api/v1/me/follows", { headers });
    assert.equal(listed.headers.get("cache-control"), "no-store");
    const follows = await listed.json();
    assert.deepEqual(
      follows.creators.map((row) => row.userId),
      [CREATOR_ID],
    );
    assert.deepEqual(
      follows.houses.map((row) => row.labelId),
      [HOUSE_ID],
    );

    const merged = await call("/api/v1/me/merge-guest", {
      method: "POST",
      headers,
      body: {
        saves: [LOOK_ID, LOOK_ID, "not-a-look"],
        creators: [CREATOR_ID, "missing-creator"],
        houses: [HOUSE_ID, "missing-house"],
      },
    });
    assert.equal(merged.status, 200, await merged.clone().text());
    assert.equal(merged.headers.get("cache-control"), "no-store");
    assert.deepEqual(await merged.json(), {
      saves: [LOOK_ID],
      creators: [CREATOR_ID],
      houses: [HOUSE_ID],
    });

    const saves = await call("/api/v1/me/saves", { headers });
    assert.deepEqual((await saves.json()).saves.map((row) => row.lookId), [LOOK_ID]);
  });
});
