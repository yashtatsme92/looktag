import { auth } from "../../auth/server";
import { getSql } from "../../db";

/** True only for the addresses the e2e suites sign up. */
export function isLooktagTestEmail(email: string): boolean {
  return email.endsWith("@looktag.test");
}

/**
 * Delete one e2e user through Better Auth's adapter (sessions, accounts, user).
 * App tables that are not part of that adapter are removed first.
 * Refuses every address that is not `@looktag.test`.
 */
export async function deleteLooktagTestUser(userId: string): Promise<{ id: string }> {
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  const email = rows[0]?.email ?? "";
  if (!isLooktagTestEmail(email)) {
    throw new Error("Refusing to delete this account.");
  }
  await sql`delete from looks where user_id = ${userId}`;
  await sql`delete from profiles where user_id = ${userId}`;
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUser(userId);
  return { id: userId };
}
