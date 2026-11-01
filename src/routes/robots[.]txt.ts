import { createFileRoute } from "@tanstack/react-router";
import { canonicalOrigin } from "@/lib/share-meta";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = canonicalOrigin(request);
        const sitemap = origin ? `Sitemap: ${origin}/sitemap.xml\n` : "";
        const body = `User-agent: *\nAllow: /\nAllow: /looks/\nAllow: /houses/\n${sitemap}`;
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
