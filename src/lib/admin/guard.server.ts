import { getSessionUser, UnauthorizedError, type VerifiedUser } from "@/lib/auth/verify.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { isAdminEmail } from "./access";

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
  if (!isAdminEmail(user.email)) throw new ForbiddenError();
  return user;
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
