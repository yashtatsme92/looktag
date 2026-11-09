import { createFileRoute } from "@tanstack/react-router";
import { isSameSiteAllowed } from "@/lib/auth/same-site";
import {
  getLookRequestSchema,
  getLookResponseSchema,
  looksApiErrorSchema,
} from "@/lib/looks/api-contract";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/v1/looks/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isSameSiteAllowed(request.headers, request.method)) {
          return json(looksApiErrorSchema.parse({ error: "Forbidden" }), 403);
        }
        const parsed = getLookRequestSchema.safeParse(params);
        if (!parsed.success) return json(looksApiErrorSchema.parse({ error: "Bad request" }), 400);
        const { getLookById } = await import("@/lib/looks/looks-read");
        const look = await getLookById({ data: parsed.data.id });
        if (!look) return json(looksApiErrorSchema.parse({ error: "Not found" }), 404);
        return json(getLookResponseSchema.parse(look), 200);
      },
    },
  },
});
