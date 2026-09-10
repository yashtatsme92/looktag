import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_DEFAULTS,
  CONFIG_EXTRAS_KEYS,
  INTEGRATIONS,
  STUDIO_COLUMNS,
  databaseBackend,
  integrationStatus,
} from "./config.ts";
import { EXTRAS_KEYS } from "./settings/model.ts";

describe("config registry", () => {
  it("lists unique integration env keys", () => {
    const keys = INTEGRATIONS.map((item) => item.env);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.includes("DATABASE_URL"));
    assert.ok(keys.includes("XAI_API_KEY"));
    assert.ok(keys.includes("BETTER_AUTH_SECRET"));
    assert.ok(keys.includes("BETTER_AUTH_URL"));
    assert.ok(keys.includes("GROK_AUTH_CLIENT_ID"));
    assert.ok(keys.includes("ADMIN_BOOTSTRAP_PASSWORD"));
    assert.ok(keys.includes("ADMIN_BOOTSTRAP"));
  });

  it("keeps extras keys in sync with settings", () => {
    assert.deepEqual([...CONFIG_EXTRAS_KEYS], [...EXTRAS_KEYS]);
    assert.ok(CONFIG_EXTRAS_KEYS.includes("searchEngine"));
    assert.ok(CONFIG_EXTRAS_KEYS.includes("scoreLook"));
  });

  it("keeps sign-up and Houses as columns, not extras", () => {
    for (const column of STUDIO_COLUMNS) {
      assert.equal((CONFIG_EXTRAS_KEYS as readonly string[]).includes(column), false);
    }
  });

  it("selects PGLite when DATABASE_URL is empty", () => {
    assert.equal(databaseBackend({}), "pglite");
    assert.equal(databaseBackend({ DATABASE_URL: "   " }), "pglite");
    assert.equal(databaseBackend({ DATABASE_URL: "postgres://looktag" }), "postgres");
  });

  it("reports which integrations are live", () => {
    const status = integrationStatus({
      DATABASE_URL: "postgres://looktag",
      XAI_API_KEY: "",
      BETTER_AUTH_SECRET: "test-secret",
    });
    assert.equal(status.DATABASE_URL, true);
    assert.equal(status.XAI_API_KEY, false);
    assert.equal(status.APP_URL, false);
    assert.equal(status.BETTER_AUTH_SECRET, true);
    assert.equal(status.ADMIN_BOOTSTRAP_PASSWORD, false);
  });

  it("exposes studio defaults", () => {
    assert.equal(CONFIG_DEFAULTS.labelsEnabled, true);
    assert.equal(CONFIG_DEFAULTS.searchEngine, "xai");
    assert.equal(CONFIG_DEFAULTS.scoreLook, 12);
  });
});
