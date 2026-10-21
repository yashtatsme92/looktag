import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  openSharedPool,
  postgresPoolOptions,
  resolveDbSource,
  singleton,
  warnIfProductionWithoutDatabase,
} from "../../scripts/pg-pool.mjs";

describe("database backend selection", () => {
  it("treats a blank DATABASE_URL as PGLite", () => {
    assert.equal(resolveDbSource(undefined), "pglite");
    assert.equal(resolveDbSource(""), "pglite");
    assert.equal(resolveDbSource("   "), "pglite");
    assert.equal(resolveDbSource("postgresql://looktag/db"), "neon");
  });

  it("sets ssl for Neon and a modest pool", () => {
    const pooled = postgresPoolOptions(
      "postgresql://user:password@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    );
    assert.equal(pooled.max, 5);
    assert.equal(pooled.idleTimeoutMillis, 10_000);
    assert.deepEqual(pooled.ssl, { rejectUnauthorized: false });
    assert.equal(
      postgresPoolOptions("postgres://local/db").ssl,
      undefined,
    );
    assert.deepEqual(postgresPoolOptions("postgres://local/db?sslmode=verify-full").ssl, {
      rejectUnauthorized: true,
    });
  });

  it("uses one shared pool (mock pg)", () => {
    const created: Array<{ max: number; ssl?: { rejectUnauthorized: boolean } }> = [];
    const pg = {
      Pool: class {
        constructor(config: { max: number; ssl?: { rejectUnauthorized: boolean } }) {
          created.push(config);
        }
      },
      types: { setTypeParser() {} },
    };
    const url = "postgres://looktag/db?sslmode=require";
    const first = openSharedPool(url, pg as never);
    const second = openSharedPool(url, pg as never);
    assert.equal(first, second);
    assert.equal(created.length, 1);
    assert.equal(created[0]?.max, 5);
    assert.deepEqual(created[0]?.ssl, { rejectUnauthorized: false });

    const get = singleton(() => ({ id: created.length }));
    assert.equal(get(), get());
  });

  it("warns once in production when DATABASE_URL is missing and does not exit", () => {
    const messages: string[] = [];
    const flag = { done: false };
    const warn = (message: string) => messages.push(message);
    assert.equal(
      warnIfProductionWithoutDatabase({ NODE_ENV: "production", DATABASE_URL: "  " }, warn, flag),
      true,
    );
    assert.equal(
      warnIfProductionWithoutDatabase({ NODE_ENV: "production", DATABASE_URL: "" }, warn, flag),
      false,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0] ?? "", /PGLite/);
    assert.doesNotMatch(messages[0] ?? "", /postgres:\/\//);
    assert.equal(
      warnIfProductionWithoutDatabase(
        { NODE_ENV: "test", DATABASE_URL: "" },
        warn,
        { done: false },
      ),
      false,
    );
  });
});
