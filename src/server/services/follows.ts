import type { Sql } from "../../lib/providers/db/types.ts";
import { capIds, isoTimestamp } from "./library-ids.ts";

export type CreatorFollow = { userId: string; createdAt: string };
export type HouseFollow = { labelId: string; createdAt: string };

export type FollowAdd =
  | { status: "following"; createdAt: string }
  | { status: "self" }
  | { status: "missing" };

export async function listCreatorFollows(sql: Sql, userId: string): Promise<CreatorFollow[]> {
  const rows = await sql<{ creator_user_id: string; created_at: unknown }>`
    select f.creator_user_id, f.created_at
    from creator_follows f
    join profiles p on p.user_id = f.creator_user_id
    where f.user_id = ${userId}
    order by f.created_at desc, f.creator_user_id asc
  `;
  return rows.map((row) => ({ userId: row.creator_user_id, createdAt: isoTimestamp(row.created_at) }));
}

export async function listHouseFollows(sql: Sql, userId: string): Promise<HouseFollow[]> {
  const rows = await sql<{ label_id: string; created_at: unknown }>`
    select f.label_id, f.created_at
    from house_follows f
    join fashion_labels l on l.id = f.label_id
    where f.user_id = ${userId}
    order by f.created_at desc, f.label_id asc
  `;
  return rows.map((row) => ({ labelId: row.label_id, createdAt: isoTimestamp(row.created_at) }));
}

export async function listFollows(sql: Sql, userId: string) {
  const [creators, houses] = await Promise.all([
    listCreatorFollows(sql, userId),
    listHouseFollows(sql, userId),
  ]);
  return { creators, houses };
}

/** A profile must exist. Following yourself is rejected. A second add is a no-op. */
export async function addCreatorFollow(sql: Sql, userId: string, creatorUserId: string): Promise<FollowAdd> {
  if (!creatorUserId || userId === creatorUserId) return { status: "self" };
  const inserted = await sql<{ created_at: unknown }>`
    insert into creator_follows (user_id, creator_user_id)
    select ${userId}, user_id from profiles where user_id = ${creatorUserId}
    on conflict (user_id, creator_user_id) do nothing
    returning created_at
  `;
  if (inserted[0]) return { status: "following", createdAt: isoTimestamp(inserted[0].created_at) };
  const existing = await sql<{ created_at: unknown }>`
    select created_at from creator_follows
    where user_id = ${userId} and creator_user_id = ${creatorUserId}
  `;
  if (existing[0]) return { status: "following", createdAt: isoTimestamp(existing[0].created_at) };
  return { status: "missing" };
}

export async function removeCreatorFollow(sql: Sql, userId: string, creatorUserId: string): Promise<void> {
  await sql`
    delete from creator_follows where user_id = ${userId} and creator_user_id = ${creatorUserId}
  `;
}

/** A house must exist. A second add keeps the original created_at. */
export async function addHouseFollow(
  sql: Sql,
  userId: string,
  labelId: string,
): Promise<Exclude<FollowAdd, { status: "self" }>> {
  const inserted = await sql<{ created_at: unknown }>`
    insert into house_follows (user_id, label_id)
    select ${userId}, id from fashion_labels where id = ${labelId}
    on conflict (user_id, label_id) do nothing
    returning created_at
  `;
  if (inserted[0]) return { status: "following", createdAt: isoTimestamp(inserted[0].created_at) };
  const existing = await sql<{ created_at: unknown }>`
    select created_at from house_follows where user_id = ${userId} and label_id = ${labelId}
  `;
  if (existing[0]) return { status: "following", createdAt: isoTimestamp(existing[0].created_at) };
  return { status: "missing" };
}

export async function removeHouseFollow(sql: Sql, userId: string, labelId: string): Promise<void> {
  await sql`delete from house_follows where user_id = ${userId} and label_id = ${labelId}`;
}

/** Dedupe, skip unknown creators and the viewer, keep existing rows. */
export async function mergeGuestCreators(
  sql: Sql,
  userId: string,
  creatorIds: unknown,
): Promise<string[]> {
  const ids = capIds(creatorIds).filter((id) => id !== userId);
  for (const creatorUserId of [...ids].reverse()) {
    await sql`
      insert into creator_follows (user_id, creator_user_id)
      select ${userId}, user_id from profiles where user_id = ${creatorUserId}
      on conflict (user_id, creator_user_id) do nothing
    `;
  }
  if (ids.length === 0) return [];
  const listed = await listCreatorFollows(sql, userId);
  const have = new Set(listed.map((row) => row.userId));
  return ids.filter((id) => have.has(id));
}

/** Dedupe and skip unknown houses. */
export async function mergeGuestHouses(sql: Sql, userId: string, labelIds: unknown): Promise<string[]> {
  const ids = capIds(labelIds);
  for (const labelId of [...ids].reverse()) {
    await sql`
      insert into house_follows (user_id, label_id)
      select ${userId}, id from fashion_labels where id = ${labelId}
      on conflict (user_id, label_id) do nothing
    `;
  }
  if (ids.length === 0) return [];
  const listed = await listHouseFollows(sql, userId);
  const have = new Set(listed.map((row) => row.labelId));
  return ids.filter((id) => have.has(id));
}
