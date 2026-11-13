import { slugHandle } from "./handle.ts";
import { EDITORIAL_USER_ID } from "./types.ts";
import type { Sql } from "../providers/db/types.ts";

/** Stable id for a seeded creator. The same name always maps to the same record. */
export function seededCreatorId(name: string): string {
  const slug = slugHandle(name, 40) || "creator";
  return `seed-${slug}`;
}

export function seededCreatorHandle(name: string): string {
  const slug = slugHandle(name, 24);
  return slug.length >= 2 ? slug : "creator";
}

type SeededLookLink = { id: string; userId: string; creator: string };

const seededCreatorsDone = new WeakSet<Sql>();

/** Insert-if-missing profiles, and point existing editorial seed rows at their creator. */
export async function ensureSeededCreators(sql: Sql, looks: readonly SeededLookLink[]): Promise<void> {
  if (seededCreatorsDone.has(sql)) return;
  const creators = new Map<string, string>();
  for (const look of looks) {
    creators.set(look.userId, look.creator.trim() || "Creator");
    await sql`
      update looks set user_id = ${look.userId}
      where id = ${look.id} and user_id = ${EDITORIAL_USER_ID}
    `;
  }
  creators.set(EDITORIAL_USER_ID, "Editorial");
  for (const [userId, name] of creators) {
    const existing = await sql<{ user_id: string }>`
      select user_id from profiles where user_id = ${userId} limit 1
    `;
    if (existing[0]) continue;
    const handle = userId === EDITORIAL_USER_ID ? "editorial" : seededCreatorHandle(name);
    await sql`
      insert into profiles (user_id, display_name, handle, city, bio)
      values (${userId}, ${name}, ${handle}, ${""}, ${""})
      on conflict (user_id) do nothing
    `;
  }
  seededCreatorsDone.add(sql);
}