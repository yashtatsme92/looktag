import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const CASES: Array<{ name: string; env: Record<string, string>; pattern: RegExp }> = [
  { name: "DB_PROVIDER", env: { DB_PROVIDER: "postgress" }, pattern: /Unknown DB_PROVIDER "postgress"\. Expected postgres\|pglite\|neon\./ },
  { name: "AI_PROVIDER", env: { AI_PROVIDER: "grok" }, pattern: /Unknown AI_PROVIDER "grok"\. Expected xai\|stub\./ },
  { name: "ERROR_PROVIDER", env: { ERROR_PROVIDER: "sentyr" }, pattern: /Unknown ERROR_PROVIDER "sentyr"\. Expected console\|sentry\|none\./ },
  { name: "SHOP_SEARCH_PROVIDER", env: { SHOP_SEARCH_PROVIDER: "bing" }, pattern: /Unknown SHOP_SEARCH_PROVIDER "bing"\. Expected brave\|google-cse\|duckduckgo\./ },
  { name: "STORAGE_PROVIDER", env: { STORAGE_PROVIDER: "s4" }, pattern: /Unknown STORAGE_PROVIDER "s4"\. Expected local\|s3\|r2\./ },
  { name: "TELEMETRY_PROVIDER", env: { TELEMETRY_PROVIDER: "jaeger" }, pattern: /Unknown TELEMETRY_PROVIDER "jaeger"\. Expected otlp\|none\./ },
  { name: "EMAIL_PROVIDER", env: { EMAIL_PROVIDER: "smtp" }, pattern: /Unknown EMAIL_PROVIDER "smtp"\. Expected console\./ },
  { name: "AUTH_PROVIDER", env: { AUTH_PROVIDER: "auth0" }, pattern: /Unknown AUTH_PROVIDER "auth0"\. Expected better-auth\./ },
  { name: "SUGGEST_PROVIDER", env: { SUGGEST_PROVIDER: "google" }, pattern: /Unknown SUGGEST_PROVIDER "google"\. Expected shop-search\./ },
];

function boot(extra: Record<string, string>) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "src/lib/providers/boot.ts"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: "",
      DB_PROVIDER: "",
      AI_PROVIDER: "",
      ERROR_PROVIDER: "",
      SHOP_SEARCH_PROVIDER: "",
      STORAGE_PROVIDER: "",
      TELEMETRY_PROVIDER: "",
      EMAIL_PROVIDER: "",
      AUTH_PROVIDER: "",
      SUGGEST_PROVIDER: "",
      LOOKTAG_ALLOW_EPHEMERAL_DB: "",
      ALLOW_EPHEMERAL_DB: "",
      npm_lifecycle_event: "",
      ...extra,
    },
  });
}

describe("provider startup", () => {
  for (const item of CASES) {
    it(`exits before listen when ${item.name} is a typo`, () => {
      const result = boot(item.env);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stderr}${result.stdout}`, item.pattern);
      assert.doesNotMatch(`${result.stderr}${result.stdout}`, /Listening/);
    });
  }

  it("exits when production has no database and no opt-in", () => {
    const result = boot({ NODE_ENV: "production" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /DATABASE_URL is not set/);
  });

  it("keeps DB_PROVIDER=pglite when DATABASE_URL is set", () => {
    const result = boot({
      NODE_ENV: "production",
      DB_PROVIDER: "pglite",
      DATABASE_URL: "postgres://db.example/looktag",
    });
    assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
  });

  it("is wired into the dev server and the production server", () => {
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    const plugin = readFileSync(join(root, "server/plugins/refuse-ephemeral.ts"), "utf8");
    assert.match(vite, /bootProviders/);
    assert.match(plugin, /bootProviders/);
  });
});
