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
        try {
          const { getLookById } = await import("@/lib/looks/looks-read");
          const look = await getLookById({ data: parsed.data.id });
          if (!look) return json(looksApiErrorSchema.parse({ error: "Not found" }), 404);
          const response = getLookResponseSchema.safeParse(look);
          if (!response.success) {
            console.warn(
              "[api/v1/looks] look does not match response contract",
              response.error.issues.map(({ path, code }) => ({ path, code })),
            );
            return json(looksApiErrorSchema.parse({ error: "Unable to serialize look" }), 500);
          }
          return json(response.data, 200);
        } catch (error) {
          console.error("[api/v1/looks] request failed", error);
          return json(looksApiErrorSchema.parse({ error: "Internal server error" }), 500);
        }
      },
    },
  },
});
