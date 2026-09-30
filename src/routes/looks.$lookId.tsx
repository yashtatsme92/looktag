import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { LookPlate } from "@/components/looks/look-plate";
import { WideLook } from "@/components/looks/wide-look";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { funnelUserState } from "@/lib/looks/funnel";
import { getLookById } from "@/lib/looks/api";
import { useLook } from "@/lib/looks/store";
import { ownsLook } from "@/lib/looks/types";
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
  component: LookPage,
});

function LookPage() {
  const { lookId } = Route.useParams();
  const { look: ssrLook } = Route.useLoaderData();
  const lookFromStore = useLook(lookId);
  const { user } = useCurrentUserState();
  const look = lookFromStore ?? (ssrLook && ssrLook.id === lookId ? ssrLook : undefined);

  if (!look) {
    return (
      <AppShell title="Look" backTo="/">
        <h1 className="font-display text-4xl">Look not found</h1>
        <p className="mt-3 text-muted-foreground">It may have been deleted.</p>
        <Button asChild className="mt-6">
          <Link to="/">Back to looks</Link>
        </Button>
      </AppShell>
    );
  }

  const mine = ownsLook(look, user?.id);
  const state = funnelUserState(Boolean(user));

  return (
    <AppShell title={look.title} backTo="/" flush header="hidden">
      <div className="lt-until-desk">
        <LookPlate look={look} userState={state} canEdit={mine} />
      </div>
      <div className="lt-desk">
        <WideLook look={look} userState={state} canEdit={mine} />
      </div>
    </AppShell>
  );
}
