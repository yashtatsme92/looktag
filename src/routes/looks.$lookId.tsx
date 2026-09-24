import { createFileRoute } from "@tanstack/react-router";
import { LookDetailPage } from "@/components/looks/look-detail-page";
import { getLookById } from "@/lib/looks/api";
import { recordShareView } from "@/lib/share/api";
import {
  lookShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

export const Route = createFileRoute("/looks/$lookId")({
  ssr: true,
  loader: async ({ params }) => {
    try {
      const look = await getLookById({ data: params.lookId });
      const share = await recordShareView({
        data: { kind: "look", id: params.lookId, found: Boolean(look) },
      });
      return { look, origin: share.origin };
    } catch {
      return { look: null, origin: "" };
    }
  },
  headers: ({ loaderData }) => shareCacheHeaders(Boolean(loaderData?.look)),
  head: ({ loaderData }) => {
    const look = loaderData?.look;
    if (!look) return notFoundShareHead("look");
    return shareHead(lookShareMeta(look, loaderData.origin));
  },
  component: LookDetailRoute,
});

function LookDetailRoute() {
  const { lookId } = Route.useParams();
  const { look: ssrLook } = Route.useLoaderData();
  return <LookDetailPage lookId={lookId} ssrLook={ssrLook} />;
}
