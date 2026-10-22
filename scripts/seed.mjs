#!/usr/bin/env node
/**
 * Idempotent catalog seed. Not part of `db:migrate`.
 *
 * Houses, collections, styles and creator profiles that ship in SQL migrations
 * are already applied by `npm run db:migrate`. Editorial looks and the rest of
 * the house catalog live in code (`src/lib/looks/seed.ts`,
 * `src/lib/labels/seed.ts`) and are inserted by `seedCatalog` — the same
 * function the server runs on first read. Inserts are `on conflict do nothing`
 * (looks also go through `seeded_items`), so running this again changes nothing.
 * House looks (`house-*`) are recorded as `house_look` the same way.
 * Centred crops are computed here, so migrate-then-seed leaves no null crops.
 *
 * The Vite loader does not watch files (`server.watch` is null). Seed needs
 * the dev dependency `vite` on the machine that runs it.
 *
 * Looks are not copied into a second SQL file. A fresh PGLite database gets
 * the same rows when the server calls `seedCatalog`; this command does that
 * up front for Neon.
 *
 *   npm run db:migrate && npm run db:seed
 *
 * No DATABASE_URL -> skip. PGLite seeds itself on first request.
 */
import { createServer } from "vite";
import { backfillLookCrops } from "./backfill-look-crops.mjs";
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";

/** @type {Promise<{ seedCatalog: (sql: object) => Promise<void>, close: () => Promise<void> }> | undefined} */
let loader;

async function loadSeedCatalog() {
  loader ??= (async () => {
    const vite = await createServer({
      configFile: false,
      root: process.cwd(),
      resolve: { alias: { "@": `${process.cwd()}/src` } },
      server: { middlewareMode: true, watch: null, hmr: false },
      appType: "custom",
      logLevel: "silent",
    });
    const mod = await vite.ssrLoadModule("/src/lib/looks/looks-shared.ts");
    return {
      seedCatalog: /** @type {(sql: object) => Promise<void>} */ (mod.seedCatalog),
      close: () => vite.close(),
    };
  })();
  return loader;
}

/**
 * @param {{
 *   query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
 * }} runner
 */
export function toSql(runner) {
  /**
   * @param {TemplateStringsArray} strings
   * @param {...unknown} values
   */
  const sql = async (strings, ...values) => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1] ?? ""}`;
    }
    const result = await runner.query(text, values);
    return result.rows;
  };
  /**
   * @param {string} text
   * @param {unknown[]} [params]
   */
  sql.query = async (text, params = []) => (await runner.query(text, params)).rows;
  return sql;
}

/** @param {ReturnType<typeof toSql>} sql */
export async function seedDatabase(sql) {
  const { seedCatalog } = await loadSeedCatalog();
  await seedCatalog(sql);
  return backfillLookCrops(/** @type {any} */ (sql));
}

export async function closeSeedLoader() {
  if (!loader) return;
  const loaded = await loader;
  await loaded.close();
  loader = undefined;
}

const databaseUrl = process.env.DATABASE_URL?.trim();

async function main() {
  if (!databaseUrl) {
    console.log(
      "[seed] DATABASE_URL not set — skipping. PGLite runs seedCatalog on first request.",
    );
    return;
  }
  const pool = openDedicatedPool(databaseUrl);
  const client = await pool.connect();
  try {
    const crops = await seedDatabase(toSql({ query: (text, params) => client.query(text, params) }));
    if (crops) console.log(`[seed] backfilled ${crops} centred look crop(s).`);
    console.log("[seed] catalog is up to date.");
  } finally {
    client.release();
    await pool.end();
    await closeSeedLoader();
  }
}

// Only the CLI connects. Tests import seedDatabase and pass their own SQL.
const isCli = process.argv[1]?.endsWith("seed.mjs") || process.argv[1]?.endsWith("seed.mjs/");
if (isCli) {
  main().catch((err) => {
    console.error("[seed] failed:", err?.message || err);
    process.exit(1);
  });
}
