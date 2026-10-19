import { gateIdentityEnabled } from "./gate-identity.server";
import { bearerFromHeaders, bearerOnlyHeaders } from "./native";
import { auth, authConfigured } from "./server";
import type { VerifiedUser } from "./verify.server";

/**
 * Resolve the user for a raw `Request` (API routes, native clients). A bearer
 * token authenticates by token only — cookies are never consulted — otherwise
 * the session cookie is used. Returns `null` when nobody is signed in.
 */
export async function userFromRequest(
  request: Request,
): Promise<VerifiedUser | null> {
  if (!authConfigured && !gateIdentityEnabled()) return null;
  const token = bearerFromHeaders(request.headers);
  const headers = token
    ? bearerOnlyHeaders(request.headers, token)
    : request.headers;
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}
