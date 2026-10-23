#!/usr/bin/env node
/**
 * List look, house, product, and image rows and mark each seeded or not.
 * Prints counts and ids only. Never prints DATABASE_URL or image bytes.
 *
 *   npm run db:seed:audit
 */
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";
import { imageKey, ledgerSet, lookIsSeeded, productKey } from "./seed-ledger.mjs";

/**
 * @param {string} text
 */
function safeError(text) {
  if (/postgres(ql)?:\/\//i.test(text)) return "database connection failed";
  return text;
}

/**
 * @param {(text: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 */
export async function auditDatabase(query) {
  const ledgerRows = await query("select kind, id from seeded_items");
  const ledger = ledgerSet(ledgerRows.rows);
  const looks = await query("select id, image_src, tags_json from looks order by id");
  const houses = await query("select id, cover_src from fashion_labels order by id");
  /** @type {{ rows: Array<{ id: string, image_src?: string, images_json?: string }> }} */
  let styles = { rows: [] };
  try {
    // `to_regclass` returns null when the table is missing, so a read-only
    // transaction is not aborted the way a missing-table error would be.
    const reg = await query("select to_regclass('fashion_styles') as rel");
    if (reg.rows[0]?.rel) {
      styles = await query("select id, image_src, images_json from fashion_styles order by id");
    }
  } catch {
    styles = { rows: [] };
  }

  /** @type {Array<{ kind: string, id: string, seeded: boolean }>} */
  const rows = [];

  for (const look of looks.rows) {
    const id = String(look.id);
    rows.push({ kind: "look", id, seeded: lookIsSeeded(ledger, id) });
    const image = imageKey(String(look.image_src ?? ""), id);
    if (image) rows.push({ kind: "image", id: image, seeded: ledger.has(`image\0${image}`) });
    let tags = [];
    try {
      const parsed = JSON.parse(String(look.tags_json ?? "[]"));
      if (Array.isArray(parsed)) tags = parsed;
    } catch {
      tags = [];
    }
    for (const tag of tags) {
      if (!tag || typeof tag !== "object" || typeof tag.id !== "string" || !tag.id) continue;
      const product = productKey(id, tag.id);
      rows.push({ kind: "product", id: product, seeded: ledger.has(`product\0${product}`) });
    }
  }

  for (const house of houses.rows) {
    const id = String(house.id);
    rows.push({ kind: "house", id, seeded: ledger.has(`house\0${id}`) });
    const cover = imageKey(String(house.cover_src ?? ""), id);
    if (cover) rows.push({ kind: "image", id: cover, seeded: ledger.has(`image\0${cover}`) });
  }

  for (const style of styles.rows) {
    const owner = String(style.id);
    const srcs = [String(style.image_src ?? "")];
    try {
      const parsed = JSON.parse(String(style.images_json ?? "[]"));
      if (Array.isArray(parsed)) srcs.push(...parsed.filter((item) => typeof item === "string"));
    } catch {
      /* ignore malformed style photos */
    }
    for (const src of srcs) {
      const image = imageKey(src, owner);
      if (!image) continue;
      rows.push({ kind: "image", id: image, seeded: ledger.has(`image\0${image}`) });
    }
  }

  return dedupe(rows);
}

/** @param {Array<{ kind: string, id: string, seeded: boolean }>} rows */
function dedupe(rows) {
  const seen = new Set();
  const next = [];
  for (const row of rows) {
    const key = `${row.kind}\0${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(row);
  }
  return next;
}

/** @param {Array<{ kind: string, id: string, seeded: boolean }>} rows */
export function formatAudit(rows) {
  const kinds = ["look", "house", "product", "image"];
  const lines = [];
  for (const kind of kinds) {
    const group = rows.filter((row) => row.kind === kind);
    const seeded = group.filter((row) => row.seeded);
    const extra = group.filter((row) => !row.seeded);
    lines.push(`${kind}s ${seeded.length} seeded, ${extra.length} not seeded`);
    for (const row of seeded) lines.push(`  seeded ${row.id}`);
    for (const row of extra) lines.push(`  not-seeded ${row.id}`);
  }
  const notSeeded = rows.filter((row) => !row.seeded).length;
  lines.push(`not-seeded ${notSeeded}`);
  return lines.join("\n");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("[seed:audit] no database configured — nothing to list.");
    return;
  }
  const pool = openDedicatedPool(databaseUrl);
  const client = await pool.connect();
  try {
    const rows = await auditDatabase((text, params = []) => client.query(text, params));
    console.log(formatAudit(rows));
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = process.argv[1]?.endsWith("seed-audit.mjs");
if (isCli) {
  main().catch((err) => {
    console.error("[seed:audit] failed:", safeError(String(err?.message || err)));
    process.exit(1);
  });
}
