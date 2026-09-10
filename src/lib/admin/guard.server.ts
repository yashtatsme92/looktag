import { getSessionUser, UnauthorizedError, type VerifiedUser } from "@/lib/auth/verify.server";
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
