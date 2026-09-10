import { createFileRoute } from "@tanstack/react-router";
import { originFromRequestLike } from "@/lib/share-meta";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = originFromRequestLike(request);
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
