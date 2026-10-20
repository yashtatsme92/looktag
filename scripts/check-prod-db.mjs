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
