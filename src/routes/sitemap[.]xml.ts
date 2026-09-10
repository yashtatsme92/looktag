import { createFileRoute } from "@tanstack/react-router";
import { listFashionCollections, listFashionLabels } from "@/lib/labels/api";
import { collectionPath } from "@/lib/labels/model";
import { listPublicLooks } from "@/lib/looks/api";
import { withSpan } from "@/lib/observability/instrument";
import { absoluteUrl, originFromRequestLike } from "@/lib/share-meta";

function urlEntry(loc: string, changefreq: string) {
  return `<url><loc>${loc}</loc><changefreq>${changefreq}</changefreq></url>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const xml = await withSpan("looktag.sitemap", async (span) => {
          const origin = originFromRequestLike(request);
          const [looks, labels, collections] = await Promise.all([
            listPublicLooks(),
            listFashionLabels(),
            listFashionCollections(),
          ]);
          span.setAttribute("looktag.sitemap.looks", looks.length);
          span.setAttribute("looktag.sitemap.houses", labels.length);
          span.setAttribute("looktag.sitemap.collections", collections.length);
          span.setAttribute("looktag.share.anonymous", true);
          const urls = [
            urlEntry(absoluteUrl("/", origin), "daily"),
            urlEntry(absoluteUrl("/houses", origin), "daily"),
            urlEntry(absoluteUrl("/rank", origin), "daily"),
            ...looks.map((look) => urlEntry(absoluteUrl(`/looks/${look.id}`, origin), "weekly")),
            ...labels.map((label) => urlEntry(absoluteUrl(`/houses/${label.id}`, origin), "weekly")),
            ...collections.map((collection) =>
              urlEntry(absoluteUrl(collectionPath(collection.labelId, collection), origin), "weekly"),
            ),
          ];
          return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
        });
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
