import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authCookiePrefix } from "./auth/cookies.ts";
import { identityFromRequest } from "./auth/identity.ts";
import { trustedAuthOrigins } from "./auth/origins.ts";
import { resolveAuthProvider } from "./auth/resolve.ts";
import { productionConfigProblems } from "./assert-env.ts";
import { resolvePlatformChrome } from "./chrome.ts";
import { configErrorHtml, configErrorJson } from "./config-error.ts";
import { ENV_CATALOG } from "./env-catalog.ts";
import { resolveNitroPreset } from "../../../scripts/nitro-preset.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("auth adapter", () => {
  it("defaults to better-auth and rejects an unknown value", () => {
    assert.equal(resolveAuthProvider({}), "better-auth");
    assert.throws(() => resolveAuthProvider({ AUTH_PROVIDER: "auth0" }), /AUTH_PROVIDER/);
  });

  it("names looktag cookies unless the grok adapter is selected", () => {
    assert.equal(authCookiePrefix({}), "looktag");
    assert.equal(authCookiePrefix({ AUTH_PROVIDER: "grok" }), "grok-auth");
  });

  it("drops sandbox and localhost origins in production", () => {
    const origins = trustedAuthOrigins({
      NODE_ENV: "production",
      AUTH_PROVIDER: "better-auth",
      BETTER_AUTH_URL: "https://looktag.example",
      APP_URL: "https://looktag.example",
    });
    assert.deepEqual(origins, ["https://looktag.example"]);
    assert.equal(origins.some((item) => item.includes("grok")), false);
  });

  it("ignores a forged gate header and does not fetch", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    try {
      const identity = await identityFromRequest(
        new Request("https://looktag.example/", { headers: { "x-grok-identity": "forged.token.value" } }),
        { AUTH_PROVIDER: "better-auth" },
      );
      assert.equal(identity, null);
      assert.deepEqual(calls, []);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("platform chrome", () => {
  it("defaults to none and keeps grok only when asked", () => {
    assert.equal(resolvePlatformChrome({}), "none");
    assert.equal(resolvePlatformChrome({ AUTH_PROVIDER: "grok" }), "grok");
    assert.equal(resolvePlatformChrome({ AUTH_PROVIDER: "grok", PLATFORM_CHROME: "none" }), "none");
    assert.equal(resolvePlatformChrome({}, "preview.grok-sandbox.com"), "grok");
  });
});

describe("configuration errors", () => {
  it("lists names only and never the canary secret", () => {
    const canary = "canary-secret-not-a-real-value";
    const problems = productionConfigProblems({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: canary,
      AUTH_PROVIDER: "better-auth",
    });
    const html = configErrorHtml(problems);
    const json = configErrorJson(problems);
    assert.match(html, /DATABASE_URL/);
    assert.match(html, /BETTER_AUTH_URL/);
    assert.match(html, /APP_URL/);
    assert.equal(html.includes(canary), false);
    assert.equal(json.includes(canary), false);
    assert.equal(problems.some((item) => item.name === "BETTER_AUTH_SECRET"), false);
  });

  it("allows loopback http so CI can boot", () => {
    const problems = productionConfigProblems({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://db.example/looktag",
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "http://127.0.0.1:4173",
      APP_URL: "http://127.0.0.1:4173",
      LOOKTAG_ALLOW_EPHEMERAL_DB: "",
    });
    assert.deepEqual(problems, []);
  });
});

describe("nitro preset log", () => {
  it("logs the selected preset when asked", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      assert.equal(resolveNitroPreset({ LOOKTAG_LOG_NITRO_PRESET: "1" }), "node-server");
      assert.match(lines.join("\n"), /\[nitro\] preset node-server/);
    } finally {
      console.log = original;
    }
  });
});

describe("env catalog", () => {
  it("documents every catalog variable", () => {
    const doc = readFileSync(join(root, "docs/SELF_HOSTING.md"), "utf8");
    for (const row of ENV_CATALOG) {
      assert.match(doc, new RegExp(`\\b${row.name}\\b`), row.name);
    }
  });
});
