import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { FadeLayer } from "@/components/ds/fade-layer";
import { ImgSlot } from "@/components/ds/img-slot";
import { SkeletonGrid } from "@/components/ds/skeleton";
import { Button } from "@/components/ui/button";
import { getFashionCollection, getHousesAvailability, type FashionCollectionPage } from "@/lib/labels/api";
import { publicLines } from "@/lib/labels/model";
import { clientDeferred, isDeferred, useRouteLoad } from "@/lib/loading/route-load";
import { shareOrCopy } from "@/lib/looks/share";
import { recordShareView } from "@/lib/share/api";
import {
  collectionShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

type LineData = {
  open: boolean;
  page: FashionCollectionPage | null;
  origin: string;
};

async function loadLine(labelId: string, collectionId: string): Promise<LineData> {
  try {
    const open = await getHousesAvailability();
    if (!open) return { open: false, page: null, origin: "" };
    const data = await getFashionCollection({
      data: { labelId, collectionId },
    });
    const share = await recordShareView({
      data: {
        kind: "collection",
        id: `${labelId}/${collectionId}`,
        found: Boolean(data),
      },
    });
    return { open: true, page: data as FashionCollectionPage | null, origin: share.origin };
  } catch {
    return { open: true, page: null, origin: "" };
  }
}

export const Route = createFileRoute("/houses_/$labelId_/$collectionId")({
  ssr: true,
  loader: ({ params }) => clientDeferred(() => loadLine(params.labelId, params.collectionId), `house:${params.labelId}:line:${params.collectionId}`),
  headers: ({ loaderData }) => {
    if (!loaderData || isDeferred(loaderData)) return {};
    return shareCacheHeaders(Boolean(loaderData.page));
  },
  head: ({ loaderData }) => {
    if (!loaderData || isDeferred(loaderData)) return { meta: [{ title: "Line — Looktag" }] };
    const page = loaderData.page;
    if (!page) return notFoundShareHead("collection");
    const imageSrc = page.styles[0]?.imageSrc ?? "";
    return shareHead(collectionShareMeta(page.label, page.collection, loaderData.origin, imageSrc));
  },
  component: LinePage,
});

function LinePage() {
  const { labelId, collectionId } = Route.useParams();
  const seeded = Route.useLoaderData();
  const lineLoad = useRouteLoad(seeded, `house:${labelId}:line:${collectionId}`, () => loadLine(labelId, collectionId));
  const data = lineLoad.data;
  const page = data?.page ?? null;
  const closed = useHousesClosed(data ? data.open : true);
  const [sharing, setSharing] = useState(false);
  const line = page ? publicLines([page.collection], page.styles)[0] : undefined;
  const pending = !data && !lineLoad.error;

  if (closed) return <HousesClosed />;

  if (!pending && !lineLoad.error && (!page || !line)) {
    return (
      <AppShell title="Line" backTo={`/houses/${labelId}`}>
        <h1 className="ds-screen-title">Line not found</h1>
        <p className="mt-3 text-muted-foreground">This line is not on Looktag yet.</p>
        <Button asChild className="mt-6">
          <Link to="/houses/$labelId" params={{ labelId }}>
            Back to house
          </Link>
        </Button>
      </AppShell>
    );
  }

  const label = page?.label;
  const collection = page?.collection;
  const stateKey = lineLoad.error ? "error" : lineLoad.skeleton ? "skeleton" : pending ? "waiting" : "ready";

  async function shareLine() {
    if (!label || !collection) return;
    setSharing(true);
    const url = `${window.location.origin}/houses/${labelId}/${collection.slug || collectionId}`;
    const result = await shareOrCopy({
      title: `${collection.name} — ${label.name}`,
      text: collection.caption || `${collection.name} by ${label.name}`,
      url,
      kind: "collection",
    });
    setSharing(false);
    if (result === "copied") toast.success("Link copied");
    if (result === "shown") toast.message("Share this line", { description: url });
  }

  return (
    <AppShell
      title="Line"
      backTo={label ? `/houses/${label.id}` : `/houses/${labelId}`}
      trailing={
        label && collection ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Share line"
            disabled={sharing}
            onClick={() => void shareLine()}
          >
            <Share2 className="size-5" />
          </Button>
        ) : null
      }
    >
      <FadeLayer stateKey={stateKey}>
        {lineLoad.error ? (
          <p className="text-sm text-muted-foreground">Houses aren't available right now</p>
        ) : lineLoad.skeleton ? (
          <div className="house-lines-block">
            <h2 className="ops-section house-looks-title">Styles</h2>
            <SkeletonGrid count={4} captions />
          </div>
        ) : pending ? (
          <div className="is-loading-old" aria-hidden />
        ) : label && collection && line ? (
          <article>
            <p className="wide-kicker house-line-kicker">
              <Link to="/houses/$labelId" params={{ labelId: label.id }}>
                {label.name}
              </Link>{" "}
              · Line
            </p>
            <ScreenTitle>{collection.name}</ScreenTitle>
            {collection.caption ? <p className="house-line">{collection.caption}</p> : null}
            <h2 className="ops-section house-looks-title">Styles</h2>
            <ul className="house-lines">
              {line.styles.map((style) => (
                <li key={style.id}>
                  <Link
                    to="/houses/$labelId/$collectionId/$styleId"
                    params={{ labelId: label.id, collectionId: collection.slug, styleId: style.id }}
                    className="house-card"
                    aria-label={style.name}
                  >
                    <ImgSlot src={style.imageSrc} alt="" slotClassName="img-slot-fill" />
                    <div className="house-card-caption">
                      <p className="house-card-name">{style.name}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </FadeLayer>
    </AppShell>
  );
}