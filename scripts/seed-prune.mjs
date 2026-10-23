#!/usr/bin/env node
/**
 * Delete looks that are not in the seed ledger. Image, crop, and offers are
 * columns on that row, not separate tables. Dry run unless `--confirm`.
 *
 * User-owned looks (any user id other than `editorial` or a `label-*` house)
 * are never deleted unless `--include-user-looks` and `--confirm` are both
 * passed. That deletes real published looks. The dry run prints a count per
 * user id and a warning. It never prints emails.
 *
 * Non-seed houses are reported as audit-only. This script does not delete them.
 *
 * Refuses NODE_ENV=production. It also refuses unless every host node-pg will
 * connect to is loopback (localhost, 127.0.0.1, ::1) or a unix socket path.
 * That host is `?host=` when set (it overrides the URL host), otherwise the
 * URL host, otherwise PGHOST, otherwise localhost. A comma-separated list is
 * checked entry by entry. Pass `--allow-production` to override. Never point
 * this at a real database.
 *
 *   npm run db:seed:prune
 *   npm run db:seed:prune -- --confirm
 *   npm run db:seed:prune -- --include-user-looks --confirm
 */
import { parse } from "pg-connection-string";
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";
import { auditDatabase } from "./seed-audit.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * @param {string} token
 */
function isLoopbackOrSocket(token) {
  const raw = token.trim();
  if (raw.startsWith("/") || raw.startsWith("@")) return true;
  let host = raw;
  const bracket = host.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) host = bracket[1];
  else {
    const named = host.match(/^(.+):(\d+)$/);
    if (named && !named[1].includes(":")) host = named[1];
  }
  return LOOPBACK.has(host.toLowerCase());
}

/**
 * Hosts node-pg passes to the socket. `?host=` wins over the URL hostname
 * (`pg-connection-string`). An empty host then uses PGHOST, then localhost
 * (`pg` ConnectionParameters). Comma-separated entries are separate targets.
 * This does not open a connection.
 * @param {string | undefined} databaseUrl
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function connectHosts(databaseUrl, env = {}) {
  const raw = databaseUrl?.trim() ?? "";
  if (!raw) return ["localhost"];
  const lower = raw.toLowerCase();
  if (lower === "pglite" || lower.startsWith("pglite:") || lower.startsWith("memory:")) return ["localhost"];
  // Keyword conninfo is not what this script passes to `pg`. Refuse it.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith("/")) return ["invalid"];
  let parsed;
  try {
    parsed = parse(raw);
  } catch {
    return ["invalid"];
  }
  const parsedHost = typeof parsed.host === "string" ? parsed.host.trim() : "";
  const configured = parsedHost || String(env.PGHOST ?? "").trim() || "localhost";
  const hosts = configured
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : ["localhost"];
}

/**
 * True when every host node-pg would connect to is loopback or a unix socket.
 * The second argument is the process env (`PGHOST`). Omitted means no PGHOST.
 * @param {string | undefined} databaseUrl
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isLocalDatabase(databaseUrl, env = {}) {
  return connectHosts(databaseUrl, env).every(isLoopbackOrSocket);
}

/**
 * Editorial leftovers and house-owned looks are not a person's published looks.
 * @param {string | undefined} userId
 */
export function isUserOwnedLook(userId) {
  const id = String(userId ?? "").trim();
  if (!id || id === "editorial" || id.startsWith("label-")) return false;
  return true;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} argv
 */
export function pruneGuard(env, argv) {
  const confirm = argv.includes("--confirm");
  const allowProduction = argv.includes("--allow-production");
  const includeUserLooks = argv.includes("--include-user-looks");
  if (!allowProduction && env.NODE_ENV === "production") {
    return {
      ok: false,
      confirm,
      includeUserLooks,
      error:
        "Refusing to prune when NODE_ENV=production. Pass --allow-production to override. Do not point this at a real database.",
    };
  }
  if (!allowProduction && !isLocalDatabase(env.DATABASE_URL, env)) {
    return {
      ok: false,
      confirm,
      includeUserLooks,
      error:
        "Refusing to prune a non-local database. Pass --allow-production to override. Do not point this at a real database.",
    };
  }
  return { ok: true, confirm, includeUserLooks, error: "" };
}

/**
 * @param {Array<{ userId: string, count: number }>} counts
 */
function userLines(counts) {
  return counts.map((row) => `  user ${row.userId}: ${row.count} look(s)`);
}

/**
 * @param {(text: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 * @param {{ confirm: boolean, includeUserLooks?: boolean, failOnId?: string }} options
 */
export async function pruneUnseededLooks(query, options) {
  const includeUserLooks = options.includeUserLooks === true;
  const audited = await auditDatabase(query);
  const houses = audited.filter((row) => row.kind === "house" && !row.seeded).map((row) => row.id);
  const seededLooks = new Set(
    audited.filter((row) => row.kind === "look" && row.seeded).map((row) => row.id),
  );
  const stored = await query("select id, user_id from looks order by id");
  /** @type {Array<{ id: string, userId: string, userOwned: boolean }>} */
  const extra = [];
  for (const row of stored.rows) {
    const id = String(row.id);
    if (seededLooks.has(id)) continue;
    const userId = String(row.user_id ?? "");
    extra.push({ id, userId, userOwned: isUserOwnedLook(userId) });
  }
  const userCounts = new Map();
  for (const row of extra) {
    if (!row.userOwned) continue;
    userCounts.set(row.userId, (userCounts.get(row.userId) ?? 0) + 1);
  }
  const skippedUserLooks = [...userCounts.entries()]
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const looks = extra
    .filter((row) => !row.userOwned || includeUserLooks)
    .map((row) => row.id);

  if (!options.confirm) {
    return { dryRun: true, looks, skippedUserLooks, houses, includeUserLooks };
  }

  await query("begin");
  try {
    for (const id of looks) {
      if (options.failOnId && options.failOnId === id) {
        throw new Error("injected failure");
      }
      await query("delete from looks where id = $1", [id]);
    }
    await query("commit");
  } catch (error) {
    try {
      await query("rollback");
    } catch {
      /* the connection may already be aborted */
    }
    throw error;
  }
  return { dryRun: false, looks, skippedUserLooks, houses, includeUserLooks };
}

/**
 * @param {{
 *   dryRun: boolean,
 *   looks: string[],
 *   skippedUserLooks?: Array<{ userId: string, count: number }>,
 *   houses?: string[],
 *   includeUserLooks?: boolean,
 * }} result
 */
export function formatPrune(result) {
  const mode = result.dryRun ? "dry-run" : "deleted";
  const lines = [`${mode} ${result.looks.length} not-seeded look(s)`];
  for (const id of result.looks) {
    lines.push(`  ${mode} ${id} (image, crop, and offers are columns on this look row)`);
  }
  const users = result.skippedUserLooks ?? [];
  const userTotal = users.reduce((sum, row) => sum + row.count, 0);
  if (userTotal === 0) {
    lines.push("user-owned looks 0");
  } else if (!result.includeUserLooks) {
    lines.push(
      `warning: ${userTotal} real user look(s) were not deleted. Pass --include-user-looks with --confirm to delete them. That removes published looks, not just test data.`,
    );
    lines.push(...userLines(users));
  } else if (result.dryRun) {
    lines.push(
      `warning: --include-user-looks would delete ${userTotal} real user look(s). This dry run did not delete them.`,
    );
    lines.push(...userLines(users));
  } else {
    lines.push(`warning: deleted ${userTotal} real user look(s) because --include-user-looks was set.`);
    lines.push(...userLines(users));
  }
  const houses = result.houses ?? [];
  lines.push(`audit-only ${houses.length} not-seeded house(s); not deleted`);
  for (const id of houses) lines.push(`  house ${id}`);
  return lines.join("\n");
}

/** @param {string} text */
function safeError(text) {
  if (/postgres(ql)?:\/\//i.test(text)) return "database connection failed";
  return text;
}

async function main() {
  const guard = pruneGuard(process.env, process.argv.slice(2));
  if (!guard.ok) {
    console.error(`[seed:prune] ${guard.error}`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("[seed:prune] no database configured — nothing to do.");
    return;
  }
  const pool = openDedicatedPool(databaseUrl);
  const client = await pool.connect();
  try {
    const result = await pruneUnseededLooks(
      /** @param {string} text @param {unknown[]} [params] */
      (text, params = []) => client.query(text, params),
      { confirm: guard.confirm, includeUserLooks: guard.includeUserLooks },
    );
    console.log(formatPrune(result));
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = process.argv[1]?.endsWith("seed-prune.mjs");
if (isCli) {
  main().catch((err) => {
    console.error("[seed:prune] failed:", safeError(String(err?.message || err)));
    process.exit(1);
  });
}
