import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDbProvider } from "./index.ts";

describe("db provider", () => {
  it("defaults to postgres only when a database url is set", () => {
    assert.equal(resolveDbProvider({ DATABASE_URL: "postgres://local/db" }), "postgres");
    assert.equal(resolveDbProvider({ DATABASE_URL: "" }), "pglite");
    assert.equal(resolveDbProvider({ DB_PROVIDER: "pglite", DATABASE_URL: "postgres://local/db" }), "pglite");
    assert.equal(resolveDbProvider({ DB_PROVIDER: "neon", DATABASE_URL: "postgres://local/db" }), "postgres");
    assert.throws(
      () => resolveDbProvider({ DB_PROVIDER: "neon" }),
      /DB_PROVIDER=neon requires DATABASE_URL/,
    );
    assert.throws(
      () => resolveDbProvider({ DB_PROVIDER: "postgress" }),
      /Unknown DB_PROVIDER "postgress"\. Expected postgres\|pglite\|neon\./,
    );
  });
});
