#!/usr/bin/env node
/**
 * Hit a signed-in DB-backed route on an already running production server.
 *   PROD_CHECK_URL=http://127.0.0.1:4173 node scripts/check-prod-db.mjs
 */
const base = (process.env.PROD_CHECK_URL ?? "http://127.0.0.1:4173").replace(/\/+$/, "");
const email = `prod-${Date.now().toString(36)}@example.com`;
const password = "correct-horse-battery-1";

const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email, password, name: "Prod Check" }),
});
if (signUp.status !== 200) {
  console.error("sign-up failed", signUp.status, await signUp.text());
  process.exit(1);
}
const token = signUp.headers.get("set-auth-token");
if (!token) {
  console.error("sign-up did not return set-auth-token");
  process.exit(1);
}

const me = await fetch(`${base}/api/v1/me`, {
  headers: { authorization: `Bearer ${token}`, origin: base },
});
const body = await me.text();
if (me.status !== 200) {
  console.error("/api/v1/me failed", me.status, body);
  process.exit(1);
}
const user = JSON.parse(body)?.user;
if (user?.email !== email) {
  console.error("unexpected /api/v1/me body", body);
  process.exit(1);
}
console.log("prod db ok", email);

const versionRes = await fetch(`${base}/api/version`);
const versionText = await versionRes.text();
if (versionRes.status !== 200) {
  console.error("/api/version failed", versionRes.status, versionText);
  process.exit(1);
}
const cache = (versionRes.headers.get("cache-control") ?? "").toLowerCase();
if (!cache.includes("no-store")) {
  console.error("/api/version cache-control", cache);
  process.exit(1);
}
let info;
try {
  info = JSON.parse(versionText);
} catch {
  console.error("/api/version is not JSON", versionText);
  process.exit(1);
}
for (const key of ["version", "commit", "builtAt"]) {
  if (typeof info[key] !== "string" || !info[key].trim()) {
    console.error("/api/version missing", key, versionText);
    process.exit(1);
  }
}
if (Number.isNaN(Date.parse(info.builtAt))) {
  console.error("/api/version builtAt is not a date", info.builtAt);
  process.exit(1);
}
const expectedHeader = `${info.version}+${info.commit}`;
const versionHeader = versionRes.headers.get("x-app-version");
if (versionHeader !== expectedHeader) {
  console.error("X-App-Version", versionHeader, "expected", expectedHeader);
  process.exit(1);
}

const home = await fetch(`${base}/`);
const html = await home.text();
if (home.status !== 200) {
  console.error("home failed", home.status);
  process.exit(1);
}
if (home.headers.get("x-app-version") !== expectedHeader) {
  console.error("home X-App-Version", home.headers.get("x-app-version"));
  process.exit(1);
}
function metaContent(name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((item) => new RegExp(`\\bname=["']${name}["']`, "i").test(item));
  if (!tag) return "";
  return tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "";
}
for (const name of ["app-version", "app-commit", "app-built-at"]) {
  const content = metaContent(name);
  if (!content) {
    console.error("missing meta", name);
    process.exit(1);
  }
}
if (metaContent("app-version") !== info.version || metaContent("app-commit") !== info.commit) {
  console.error("meta does not match /api/version", {
    version: metaContent("app-version"),
    commit: metaContent("app-commit"),
  });
  process.exit(1);
}
if (metaContent("app-built-at") !== info.builtAt) {
  console.error("meta builtAt mismatch", metaContent("app-built-at"), info.builtAt);
  process.exit(1);
}
console.log("version ok", info.version, info.commit);
