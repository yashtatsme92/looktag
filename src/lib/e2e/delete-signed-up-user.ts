import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/**
 * E2E cleanup for the signed-in `@looktag.test` user.
 * Imported only from the dev branch in `src/routes/__root.tsx`, so the
 * production build does not register it. Deletion goes through the auth adapter.
 */
export const deleteSignedUpUser = createServerFn({ method: "POST" })
  .validator(() => null)
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { deleteLooktagTestUser } = await import("@/lib/providers/auth/delete-user");
    return deleteLooktagTestUser(context.userId);
  });
