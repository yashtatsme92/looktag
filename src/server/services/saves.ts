import type { Sql } from "../../lib/providers/db/types.ts";
import { capIds, isoTimestamp } from "./library-ids.ts";

export type SaveRow = { lookId: string; createdAt: string };

export type SaveAdd =
  | { status: "saved"; lookId: string; createdAt: string }
  | { status: "missing" };

export async function listSaves(sql: Sql, userId: string): Promise<SaveRow[]> {
  const rows = await sql<{ look_id: string; created_at: unknown }>`
    select s.look_id, s.created_at
    from look_saves s
    join looks l on l.id = s.look_id and l.published = true
    where s.user_id = ${userId}
    order by s.created_at desc, s.look_id asc
  `;
  return rows.map((row) => ({ lookId: row.look_id, createdAt: isoTimestamp(row.created_at) }));
}

/**
 * Insert a published look. A second call keeps the original created_at.
 * Missing or unpublished looks are not inserted.
 */
export async function addSave(sql: Sql, userId: string, lookId: string): Promise<SaveAdd> {
  const inserted = await sql<{ look_id: string; created_at: unknown }>`
    insert into look_saves (user_id, look_id)
    select ${userId}, id from looks where id = ${lookId} and published = true
    on conflict (user_id, look_id) do nothing
    returning look_id, created_at
  `;
  if (inserted[0]) {
    return { status: "saved", lookId, createdAt: isoTimestamp(inserted[0].created_at) };
  }
  const existing = await sql<{ created_at: unknown }>`
    select created_at from look_saves where user_id = ${userId} and look_id = ${lookId}
  `;
  if (existing[0]) {
    return { status: "saved", lookId, createdAt: isoTimestamp(existing[0].created_at) };
  }
  return { status: "missing" };
}

/** Delete is a no-op when the row is already gone. */
export async function removeSave(sql: Sql, userId: string, lookId: string): Promise<void> {
  await sql`delete from look_saves where user_id = ${userId} and look_id = ${lookId}`;
}

/**
 * Copy guest ids into the account. Duplicates collapse. Unknown, deleted,
 * and unpublished looks are skipped. Already-saved rows keep their time.
 * Returns the accepted ids in newest-first input order.
 */
export async function mergeGuestSaves(sql: Sql, userId: string, lookIds: unknown): Promise<string[]> {
  const ids = capIds(lookIds);
  for (const lookId of [...ids].reverse()) {
    await sql`
      insert into look_saves (user_id, look_id)
      select ${userId}, id from looks where id = ${lookId} and published = true
      on conflict (user_id, look_id) do nothing
    `;
  }
  if (ids.length === 0) return [];
  const saved = await listSaves(sql, userId);
  const have = new Set(saved.map((row) => row.lookId));
  return ids.filter((id) => have.has(id));
}
