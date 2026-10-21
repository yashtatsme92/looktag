import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertProductionDatabase,
  migrationLockMode,
  normalizeDbSource,
  openSharedPool,
  postgresPoolOptions,
  resolveDbSource,
  singleton,
} from "../../scripts/pg-pool.mjs";
import { applyMigrations } from "../../scripts/apply-migrations.mjs";

describe("database backend selection", () => {
  it("treats a blank DATABASE_URL as PGLite", () => {
    assert.equal(resolveDbSource(undefined), "pglite");
    assert.equal(resolveDbSource(""), "pglite");
    assert.equal(resolveDbSource("   "), "pglite");
    assert.equal(resolveDbSource("postgresql://looktag/db"), "postgres");
    assert.equal(resolveDbSource("neon"), "postgres");
    assert.equal(normalizeDbSource("neon"), "postgres");
    assert.equal(normalizeDbSource("postgres"), "postgres");
    assert.equal(normalizeDbSource("pglite"), "pglite");
  });

  it("verifies TLS by default and only skips with an explicit opt-in", () => {
    const pooled = postgresPoolOptions(
      "postgresql://user:password@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    );
    assert.equal(pooled.max, 5);
    assert.equal(pooled.idleTimeoutMillis, 10_000);
    assert.deepEqual(pooled.ssl, { rejectUnauthorized: true });
    assert.equal(pooled.connectionString.includes("sslmode="), false);
    assert.equal(postgresPoolOptions("postgres://local/db").ssl, undefined);
    assert.deepEqual(postgresPoolOptions("postgres://local/db?sslmode=verify-full").ssl, {
      rejectUnauthorized: true,
    });
    assert.deepEqual(postgresPoolOptions("postgres://local/db?sslmode=no-verify").ssl, {
      rejectUnauthorized: false,
    });
    assert.deepEqual(
      postgresPoolOptions("postgres://local/db?sslmode=require", { DATABASE_SSL_NO_VERIFY: "1" }).ssl,
      { rejectUnauthorized: false },
    );
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
    assert.deepEqual(created[0]?.ssl, { rejectUnauthorized: true });

    const get = singleton(() => ({ id: created.length }));
    assert.equal(get(), get());
  });

  it("refuses production without DATABASE_URL unless ephemeral mode is opted in", () => {
    assert.throws(
      () => assertProductionDatabase({ NODE_ENV: "production", DATABASE_URL: "  " }),
      /PGLite/,
    );
    assert.throws(
      () => assertProductionDatabase({ NODE_ENV: "production", DATABASE_URL: "" }),
      /LOOKTAG_ALLOW_EPHEMERAL_DB/,
    );
    assert.doesNotThrow(() =>
      assertProductionDatabase({
        NODE_ENV: "production",
        DATABASE_URL: "",
        LOOKTAG_ALLOW_EPHEMERAL_DB: "1",
      }),
    );
    assert.doesNotThrow(() =>
      assertProductionDatabase({
        NODE_ENV: "production",
        DATABASE_URL: "",
        ALLOW_EPHEMERAL_DB: "1",
      }),
    );
    assert.doesNotThrow(() =>
      assertProductionDatabase({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://looktag/db",
      }),
    );
    assert.doesNotThrow(() =>
      assertProductionDatabase({ NODE_ENV: "test", DATABASE_URL: "" }),
    );
  });

  it("uses a transaction lock on a Neon pooler host and a session lock otherwise", () => {
    assert.equal(
      migrationLockMode(
        "postgresql://user:password@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
      ),
      "transaction",
    );
    assert.equal(
      migrationLockMode(
        "postgresql://user:password@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require",
      ),
      "session",
    );
    assert.equal(migrationLockMode("postgres://local/db"), "session");
    assert.equal(migrationLockMode("   "), "session");
  });

  it("takes pg_advisory_xact_lock inside each file on the pooler", async () => {
    const calls: string[] = [];
    const db = {
      async query(text: string) {
        calls.push(text);
        return { rows: [] as Array<Record<string, unknown>> };
      },
      async exec(text: string) {
        calls.push(`exec:${text}`);
      },
    };
    const applied = await applyMigrations(
      db,
      [{ name: "0002_looks.sql", path: "0002_looks.sql", text: "select 1" }],
      { lockMode: "transaction", authEnabled: true },
    );
    assert.equal(applied, 1);
    assert.equal(calls.filter((sql) => sql.includes("pg_advisory_xact_lock")).length, 2);
    assert.equal(
      calls.some((sql) => sql.includes("pg_advisory_lock(")),
      false,
    );
    assert.ok(calls.some((sql) => sql.startsWith("exec:")));
  });
});
