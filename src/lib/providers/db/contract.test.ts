import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDbProvider } from "./index.ts";

describe("db provider", () => {
  it("defaults to postgres only when a database url is set", () => {
    assert.equal(resolveDbProvider({ DATABASE_URL: "postgres://local/db" }), "postgres");
    assert.equal(resolveDbProvider({ DATABASE_URL: "" }), "pglite");
    assert.equal(resolveDbProvider({ DB_PROVIDER: "pglite", DATABASE_URL: "postgres://local/db" }), "pglite");
    assert.equal(resolveDbProvider({ DB_PROVIDER: "neon" }), "postgres");
  });
});
