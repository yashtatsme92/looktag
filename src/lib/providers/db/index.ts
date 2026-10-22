import { resolveDbSource } from "../../../../scripts/pg-pool.mjs";
import { pgliteDialect } from "./pglite-dialect.ts";
import type { EmbeddedDb } from "./pglite.ts";
import { unknownProvider } from "../unknown.ts";

export { openPglite as openEmbeddedDb, type EmbeddedDb } from "./pglite.ts";
export { getSharedPgPool as sharedPgPool } from "./postgres.ts";

const DB_PROVIDERS = ["postgres", "pglite", "neon"] as const;

/** Read once. `DB_PROVIDER=postgres|pglite`. `neon` is a legacy alias. Default follows DATABASE_URL. */
export function resolveDbProvider(env: {
  DB_PROVIDER?: string;
  DATABASE_URL?: string;
} = process.env): "postgres" | "pglite" {
  const named = env.DB_PROVIDER?.trim().toLowerCase();
  if (named && named !== "postgres" && named !== "pglite" && named !== "neon") {
    unknownProvider("DB_PROVIDER", named, DB_PROVIDERS);
  }
  if (named === "pglite") return "pglite";
  if (named === "postgres" || named === "neon") {
    if (!env.DATABASE_URL?.trim()) {
      throw new Error(`DB_PROVIDER=${named} requires DATABASE_URL.`);
    }
    return "postgres";
  }
  return resolveDbSource(env.DATABASE_URL) === "postgres" ? "postgres" : "pglite";
}

/** Better Auth dialect for the embedded database. The registry owns this import. */
export function embeddedAuthDatabase(getDb: () => Promise<EmbeddedDb>) {
  return { dialect: pgliteDialect(getDb), type: "postgres" as const };
}
