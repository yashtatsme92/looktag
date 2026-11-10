import { createFileRoute } from "@tanstack/react-router";
import { isSameSiteAllowed } from "@/lib/auth/same-site";
import {
  listLooksRequestSchema,
  lookResponseSchema,
  looksApiErrorSchema,
} from "@/lib/looks/api-contract";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/v1/looks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isSameSiteAllowed(request.headers, request.method)) {
          return json(looksApiErrorSchema.parse({ error: "Forbidden" }), 403);
        }
        try {
          listLooksRequestSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
          const { listPublicLooks } = await import("@/lib/looks/looks-read");
          const looks = await listPublicLooks();
          const response = [];
          for (const look of looks) {
            const parsed = lookResponseSchema.safeParse(look);
            if (parsed.success) {
              response.push(parsed.data);
            } else {
              console.warn(
                "[api/v1/looks] skipping look that does not match response contract",
                parsed.error.issues.map(({ path, code }) => ({ path, code })),
              );
            }
          }
          return json(response, 200);
        } catch (error) {
          console.error("[api/v1/looks] request failed", error);
          return json(looksApiErrorSchema.parse({ error: "Internal server error" }), 500);
        }
      },
    },
  },
});
