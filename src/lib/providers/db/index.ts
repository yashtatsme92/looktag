import { resolveDbSource } from "../../../../scripts/pg-pool.mjs";

/** Read once. `DB_PROVIDER=postgres|pglite`. `neon` is a legacy alias. Default follows DATABASE_URL. */
export function resolveDbProvider(env: {
  DB_PROVIDER?: string;
  DATABASE_URL?: string;
} = process.env): "postgres" | "pglite" {
  const named = env.DB_PROVIDER?.trim().toLowerCase();
  if (named === "pglite") return "pglite";
  if (named === "postgres" || named === "neon") return "postgres";
  return resolveDbSource(env.DATABASE_URL) === "postgres" ? "postgres" : "pglite";
}
