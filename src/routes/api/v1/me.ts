import { createFileRoute } from "@tanstack/react-router";
import { isSameSiteAllowed } from "@/lib/auth/same-site";
import { looksApiErrorSchema, meResponseSchema } from "@looktag/shared";
import { getRequestUser } from "@/server/services/profiles";

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
          return json(looksApiErrorSchema.parse({ error: "Forbidden" }), 403);
        }
        const user = await getRequestUser(request);
        if (!user) return json(looksApiErrorSchema.parse({ error: "Unauthorized" }), 401);
        return json(meResponseSchema.parse({ user }), 200);
      },
    },
  },
});
