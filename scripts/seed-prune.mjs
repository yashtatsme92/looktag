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
 * `--remote-dry-run` reads `DATABASE_URL` even when the host is not loopback
 * and even when `NODE_ENV=production`. It opens `begin read only` and ends
 * with `rollback`. It never deletes or writes. `--confirm` and
 * `--include-user-looks` are refused in this mode, before any connection.
 * The report lists ids and counts only: users other than the seed admin,
 * not-seeded looks, houses, image paths and uploads, and data-URL images
 * (`data:<owner>`). It does not print emails or image bytes.
 *
 *   npm run db:seed:prune
 *   npm run db:seed:prune -- --confirm
 *   npm run db:seed:prune -- --include-user-looks --confirm
 *   DATABASE_URL=... npm run db:seed:prune -- --remote-dry-run
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
  const remoteDryRun = argv.includes("--remote-dry-run");
  if (remoteDryRun) {
    if (confirm || includeUserLooks) {
      return {
        ok: false,
        confirm: false,
        includeUserLooks: false,
        remoteDryRun: true,
        error:
          "Refusing --remote-dry-run together with a delete flag. This mode never deletes or writes.",
      };
    }
    if (!String(env.DATABASE_URL ?? "").trim()) {
      return {
        ok: false,
        confirm: false,
        includeUserLooks: false,
        remoteDryRun: true,
        error: "Refusing --remote-dry-run without DATABASE_URL.",
      };
    }
    return {
      ok: true,
      confirm: false,
      includeUserLooks: false,
      remoteDryRun: true,
      error: "",
    };
  }
  if (!allowProduction && env.NODE_ENV === "production") {
    return {
      ok: false,
      confirm,
      includeUserLooks,
      remoteDryRun: false,
      error:
        "Refusing to prune when NODE_ENV=production. Pass --allow-production to override. Do not point this at a real database.",
    };
  }
  if (!allowProduction && !isLocalDatabase(env.DATABASE_URL, env)) {
    return {
      ok: false,
      confirm,
      includeUserLooks,
      remoteDryRun: false,
      error:
        "Refusing to prune a non-local database. Pass --allow-production to override. Do not point this at a real database.",
    };
  }
  return { ok: true, confirm, includeUserLooks, remoteDryRun: false, error: "" };
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

const READ_ONLY_TXN = new Set([
  "begin read only",
  "begin transaction read only",
  "begin work read only",
  "start transaction read only",
]);

/** Seed admin mailbox. Matches `ADMIN_EMAIL` in `src/lib/admin/access.ts`. */
export const SEED_ADMIN_EMAIL = "admin@looktag.studio";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function seedAdminEmail(env = {}) {
  const raw = String(env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  return raw || SEED_ADMIN_EMAIL;
}

/**
 * True only for the statements the remote dry-run sends: a read-only
 * transaction, `select` (no `into`, no row lock), and `rollback`.
 * @param {string} text
 */
export function isReadOnlySql(text) {
  let normalized = String(text ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (normalized.endsWith(";")) normalized = normalized.slice(0, -1).trim();
  if (!normalized || normalized.includes(";")) return false;
  if (READ_ONLY_TXN.has(normalized)) return true;
  if (normalized === "rollback" || normalized === "rollback transaction" || normalized === "rollback work") {
    return true;
  }
  if (!/^select\b/.test(normalized)) return false;
  if (/\binto\b/.test(normalized)) return false;
  if (/\bfor\s+(update|no\s+key\s+update|share|key\s+share)\b/.test(normalized)) return false;
  return true;
}

/**
 * Read-only report of rows that are not repo seed.
 * Opens `begin read only` and ends with `rollback`. Never deletes or writes.
 * Users are ids only. The seed admin email is not printed.
 * @param {(text: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 * @param {{ adminEmail?: string }} [options]
 */
export async function reportUnseeded(query, options = {}) {
  const adminEmail = String(options.adminEmail ?? SEED_ADMIN_EMAIL).trim().toLowerCase() || SEED_ADMIN_EMAIL;
  /**
   * @param {string} text
   * @param {unknown[]} [params]
   */
  const guarded = async (text, params = []) => {
    if (!isReadOnlySql(text)) {
      throw new Error("remote dry-run refused a statement that is not read-only");
    }
    return query(text, params);
  };
  await guarded("begin read only");
  try {
    const audited = await auditDatabase(guarded);
    const users = await guarded('select id, email from "user" order by id');
    /** @type {string[]} */
    const otherUsers = [];
    for (const row of users.rows) {
      const email = String(row.email ?? "").trim().toLowerCase();
      if (email === adminEmail) continue;
      otherUsers.push(String(row.id));
    }
    /** @type {string[]} */
    const looks = [];
    /** @type {string[]} */
    const houses = [];
    /** @type {string[]} */
    const images = [];
    /** @type {string[]} */
    const dataImages = [];
    for (const row of audited) {
      if (row.seeded) continue;
      if (row.kind === "look") looks.push(row.id);
      else if (row.kind === "house") houses.push(row.id);
      else if (row.kind === "image") {
        if (String(row.id).startsWith("data:")) dataImages.push(row.id);
        else images.push(row.id);
      }
    }
    await guarded("rollback");
    return { users: otherUsers, looks, houses, images, dataImages };
  } catch (error) {
    try {
      await guarded("rollback");
    } catch {
      /* the connection may already be aborted */
    }
    throw error;
  }
}

/**
 * @param {{
 *   users: string[],
 *   looks: string[],
 *   houses: string[],
 *   images: string[],
 *   dataImages: string[],
 * }} result
 */
export function formatRemoteDryRun(result) {
  const lines = ["remote-dry-run read-only; wrote 0"];
  const sections = [
    ["users other than the seed admin", "user", result.users],
    ["looks", "look", result.looks],
    ["houses", "house", result.houses],
    ["images/uploads", "image", result.images],
    ["data-url images", "image", result.dataImages],
  ];
  for (const [label, prefix, ids] of sections) {
    lines.push(`${label} ${ids.length}`);
    for (const id of ids) lines.push(`  ${prefix} ${id}`);
  }
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
    /** @param {string} text @param {unknown[]} [params] */
    const query = (text, params = []) => client.query(text, params);
    if (guard.remoteDryRun) {
      const result = await reportUnseeded(query, { adminEmail: seedAdminEmail(process.env) });
      console.log(formatRemoteDryRun(result));
      return;
    }
    const result = await pruneUnseededLooks(query, {
      confirm: guard.confirm,
      includeUserLooks: guard.includeUserLooks,
    });
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
