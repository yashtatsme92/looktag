import { createFileRoute } from "@tanstack/react-router";
import { isSameSiteAllowed } from "@/lib/auth/same-site";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/v1/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isSameSiteAllowed(request.headers, request.method)) {
          return json({ error: "Forbidden" }, 403);
        }
        const { userFromRequest } = await import("@/lib/auth/request-user.server");
        const user = await userFromRequest(request);
        if (!user) return json({ error: "Unauthorized" }, 401);
        return json({ user }, 200);
      },
    },
  },
});
