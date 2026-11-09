import { createFileRoute } from "@tanstack/react-router";
import { isSameSiteAllowed } from "@/lib/auth/same-site";
import {
  listLooksRequestSchema,
  listLooksResponseSchema,
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
        listLooksRequestSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        const { listPublicLooks } = await import("@/lib/looks/looks-read");
        const looks = await listPublicLooks();
        return json(listLooksResponseSchema.parse(looks), 200);
      },
    },
  },
});
