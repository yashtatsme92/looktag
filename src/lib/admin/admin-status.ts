import { useEffect, useState } from "react";
import { createMiddleware, createServerFn } from "@tanstack/react-start";

/**
 * Forward the live-preview bearer token (mirrors `adminMiddleware`) without
 * failing for guests or non-admins: this only answers "is the caller admin?".
 */
const sessionBearerMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next }) => next());

/**
 * Server-resolved admin flag for UI (admin link, AdminGate). The browser has
 * no `ADMIN_EMAILS`, so it must not decide this from the email alone. The
 * admin server functions stay the real enforcement.
 */
export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([sessionBearerMiddleware])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { isAdminSessionUser } = await import("./guard.server");
    const bearer = (context as { bearerToken?: string }).bearerToken;
    const user = await getSessionUser(bearer);
    return { isAdmin: await isAdminSessionUser(user) };
  });

export type AdminStatus = "pending" | "admin" | "member";

/** Ask the server whether the signed-in user is admin. `userId` null → member. */
export function useAdminStatus(userId: string | null | undefined): AdminStatus {
  const [state, setState] = useState<{ userId: string | null; status: AdminStatus }>({
    userId: null,
    status: "pending",
  });
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getAdminStatus()
      .then((result) => {
        if (!cancelled) setState({ userId, status: result.isAdmin ? "admin" : "member" });
      })
      .catch(() => {
        if (!cancelled) setState({ userId, status: "member" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  if (!userId) return "member";
  return state.userId === userId ? state.status : "pending";
}
