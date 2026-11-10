/**
 * #183 integration: sign-up / sign-in origin checks and per-session sign-out.
 * Needs a running server started with
 *   BETTER_AUTH_URL=https://thelooktag.com APP_URL=https://thelooktag.com
 *   TRUSTED_ORIGINS=https://looktag.onrender.com
 * Point DOMAIN_AUTH_URL at it (e.g. http://127.0.0.1:4173). Skipped when unset.
 * Users are e2e-<ts>@example.com and are deleted at the end when the server allows it.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

const BASE = (process.env.DOMAIN_AUTH_URL || "").replace(/\/$/, "");
const CANONICAL = process.env.DOMAIN_AUTH_CANONICAL || "https://thelooktag.com";
const TRANSITIONAL = process.env.DOMAIN_AUTH_TRUSTED || "https://looktag.onrender.com";
const PASSWORD = `E2e-${Date.now()}-pass!`;
const created = [];

function cookieJar(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((line) => line.split(";")[0]).filter((pair) => !/=$/.test(pair)).join("; ");
}

/*
 * Better Auth rate-limits sign-in/sign-up per client IP when NODE_ENV=production
 * (3 req / 10 s on /sign-in/*). Every request here comes from 127.0.0.1, so the
 * suite would trip the real limiter. Give each request its own TEST-NET-3 address
 * via x-forwarded-for (Better Auth's default IP header) instead of loosening the
 * production limits.
 */
let ipCounter = 0;
function testIp() {
  ipCounter += 1;
  return `203.0.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

async function post(path, origin, body, cookie = "") {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": testIp(), ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
    redirect: "manual",
  });
}

async function session(cookie, origin = CANONICAL) {
  const res = await fetch(`${BASE}/api/auth/get-session?disableCookieCache=true`, {
    headers: { cookie, origin },
  });
  const data = res.ok ? await res.json().catch(() => null) : null;
  return data?.user?.email ?? null;
}

function email(tag) {
  const value = `e2e-${Date.now()}-${tag}@example.com`;
  created.push(value);
  return value;
}

describe("domain auth (#183)", { skip: BASE ? false : "DOMAIN_AUTH_URL not set" }, () => {
  after(async () => {
    for (const address of created) {
      const res = await post("/api/auth/sign-in/email", CANONICAL, { email: address, password: PASSWORD });
      if (!res.ok) continue;
      await post("/api/auth/delete-user", CANONICAL, {}, cookieJar(res)).catch(() => {});
    }
  });

  for (const [label, origin] of [
    ["canonical", CANONICAL],
    ["TRUSTED_ORIGINS", TRANSITIONAL],
  ]) {
    it(`sign-up and sign-in succeed from the ${label} origin`, async () => {
      const address = email(label.toLowerCase().replace(/\W/g, ""));
      const up = await post("/api/auth/sign-up/email", origin, { email: address, password: PASSWORD, name: "E2E" });
      assert.equal(up.status, 200, `sign-up from ${label}`);
      const inRes = await post("/api/auth/sign-in/email", origin, { email: address, password: PASSWORD });
      assert.equal(inRes.status, 200, `sign-in from ${label}`);
    });
  }

  it("an unlisted origin is refused with 403 INVALID_ORIGIN", async () => {
    const res = await post("/api/auth/sign-up/email", "https://not-looktag.example.com", {
      email: `e2e-${Date.now()}-x@example.com`,
      password: PASSWORD,
      name: "E2E",
    });
    assert.equal(res.status, 403);
    const body = await res.json().catch(() => ({}));
    assert.equal(body.code, "INVALID_ORIGIN");
  });

  it("signing out one session leaves the other signed in", async () => {
    const address = email("two");
    const up = await post("/api/auth/sign-up/email", CANONICAL, { email: address, password: PASSWORD, name: "E2E" });
    assert.equal(up.status, 200);
    const a = cookieJar(await post("/api/auth/sign-in/email", CANONICAL, { email: address, password: PASSWORD }));
    const b = cookieJar(await post("/api/auth/sign-in/email", CANONICAL, { email: address, password: PASSWORD }));
    assert.ok(a && b && a !== b, "two distinct sessions");
    assert.equal(await session(a), address);
    assert.equal(await session(b), address);
    const out = await post("/api/auth/sign-out", CANONICAL, {}, a);
    assert.equal(out.status, 200);
    assert.equal(await session(a), null, "signed-out session is gone");
    assert.equal(await session(b), address, "other session still signed in");
  });
});

describe("canonical edge (#183)", { skip: BASE ? false : "DOMAIN_AUTH_URL not set" }, () => {
  for (const path of [
    "/looks/e2e-missing-look",
    "/houses/e2e-missing-house",
    "/houses/e2e-missing-house/e2e-missing-line",
    "/houses/e2e-missing-house/e2e-missing-line/e2e-missing-style",
    "/creators/e2e-missing-creator",
  ]) {
    it(`${path} is HTTP 404 with noindex`, async () => {
      const res = await fetch(`${BASE}${path}`, { headers: { "x-forwarded-proto": "https" } });
      assert.equal(res.status, 404);
      assert.match(res.headers.get("x-robots-tag") ?? "", /noindex/);
      assert.equal(res.headers.get("x-looktag-status"), null);
      assert.match(await res.text(), /<meta name="robots" content="noindex"/);
    });
  }

  it("caches seed photos, fonts, splash and og.jpg, and leaves HTML and /api fresh", async () => {
    for (const path of [
      "/looks/sunday-coat.jpg",
      "/fonts/figtree-latin-500-normal.woff2",
      "/splash/wordmark-750x1334.png",
      "/og.jpg",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      assert.equal(res.status, 200, path);
      const cache = res.headers.get("cache-control") ?? "";
      assert.match(cache, /public/, path);
      assert.match(cache, /max-age=604800/, path);
      assert.equal(cache.includes("immutable"), false, path);
    }
    const home = await fetch(`${BASE}/`);
    assert.equal(home.status, 200);
    const homeCache = home.headers.get("cache-control") ?? "";
    assert.equal(/max-age=\d+/.test(homeCache), false);
    const version = await fetch(`${BASE}/api/version`);
    assert.equal(version.status, 200);
    assert.equal(version.headers.get("cache-control"), "no-store");
  });

  it("preloads at most two homepage images and lazy-loads the rest", async () => {
    const home = await fetch(`${BASE}/`);
    const html = await home.text();
    const links = html.match(/<link\b[^>]*>/gi) ?? [];
    const preloads = links.filter((tag) => /rel="preload"/i.test(tag) && /as="image"/i.test(tag));
    const images = html.match(/<img\b[^>]*>/gi) ?? [];
    const eager = images.filter((tag) => !/loading="lazy"/i.test(tag));
    assert.ok(images.length > 10, `seeded feed, got ${images.length} images`);
    assert.ok(preloads.length <= 2, preloads.join("\n"));
    assert.ok(eager.length >= 1 && eager.length <= 2, eager.join("\n"));
    for (const tag of images) {
      assert.match(tag, /decoding="async"/);
      if (!/loading="lazy"/i.test(tag)) assert.match(tag, /fetchpriority="high"/i);
    }
  });

  it("sends HSTS on https and builds robots/sitemap from APP_URL", async () => {
    const home = await fetch(`${BASE}/`, { headers: { "x-forwarded-proto": "https" } });
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
    const robots = await (await fetch(`${BASE}/robots.txt`)).text();
    assert.match(robots, new RegExp(`Sitemap: ${CANONICAL}/sitemap.xml`));
    const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
    assert.ok(!/onrender\.com|127\.0\.0\.1|localhost/.test(sitemap), "sitemap uses only APP_URL");
  });
});
