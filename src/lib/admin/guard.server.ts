import { getSessionUser, UnauthorizedError, type VerifiedUser } from "@/lib/auth/verify.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { isAdminUser } from "./access";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

export async function requireAdmin(bearerToken?: string): Promise<VerifiedUser> {
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  if (!(await isAdminSessionUser(user))) throw new ForbiddenError();
  return user;
}

/** Server-side admin check for an already-resolved session user. Never throws on "not admin". */
export async function isAdminSessionUser(user: VerifiedUser | null): Promise<boolean> {
  if (!user) return false;
  // Cheap env checks first so non-admins never hit the database.
  if (!isAdminUser({ ...user, hasPassword: false })) return false;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from "account"
    where "userId" = ${user.id} and "providerId" = 'credential'
    limit 1
  `;
  return isAdminUser({ ...user, hasPassword: Boolean(rows[0]) });
}

/**
 * Shared admin gate for createServerFn handlers: Fetch-Metadata same-site
 * isolation first, then admin role. Prefer `adminMiddleware` (which threads
 * live-preview bearer tokens) on server functions; call this helper directly
 * when middleware is not attached.
 */
export async function requireAdminSameSite(bearerToken?: string): Promise<VerifiedUser> {
  assertSameSiteRequest();
  return requireAdmin(bearerToken);
}
