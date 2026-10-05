import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Button } from "@/components/ui/button";
import { getFashionCollection, getHousesAvailability, type FashionCollectionPage } from "@/lib/labels/api";
import { publicLines } from "@/lib/labels/model";
import { shareOrCopy } from "@/lib/looks/share";
import { recordShareView } from "@/lib/share/api";
import {
  collectionShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

export const Route = createFileRoute("/houses_/$labelId_/$collectionId")({
  ssr: true,
  loader: async ({ params }) => {
    try {
      const open = await getHousesAvailability();
      if (!open) return { open: false, page: null as FashionCollectionPage | null, origin: "" };
      const data = await getFashionCollection({
        data: { labelId: params.labelId, collectionId: params.collectionId },
      });
      const share = await recordShareView({
        data: {
          kind: "collection",
          id: `${params.labelId}/${params.collectionId}`,
          found: Boolean(data),
        },
      });
      return { open: true, page: data as FashionCollectionPage | null, origin: share.origin };
    } catch {
      return { open: true, page: null, origin: "" };
    }
  },
  headers: ({ loaderData }) => shareCacheHeaders(Boolean(loaderData?.page)),
  head: ({ loaderData }) => {
    const page = loaderData?.page;
    if (!page) return notFoundShareHead("collection");
    const imageSrc = page.styles[0]?.imageSrc ?? "";
    return shareHead(collectionShareMeta(page.label, page.collection, loaderData.origin, imageSrc));
  },
  component: LinePage,
});

function LinePage() {
  const { labelId, collectionId } = Route.useParams();
  const { page, open } = Route.useLoaderData();
  const closed = useHousesClosed(open);
  const [sharing, setSharing] = useState(false);

  if (closed) return <HousesClosed />;

  const line = page ? publicLines([page.collection], page.styles)[0] : undefined;

  if (!page || !line) {
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

  const { label, collection } = page;

  async function shareLine() {
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
      backTo={`/houses/${label.id}`}
      trailing={
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
      }
    >
      <article>
        <ScreenTitle>{collection.name}</ScreenTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          <Link to="/houses/$labelId" params={{ labelId: label.id }} className="underline-offset-2 hover:underline">
            {label.name}
          </Link>
          {collection.season ? ` · ${collection.season}` : ""}
        </p>
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
                <img src={style.imageSrc} alt="" />
                <div className="house-card-caption">
                  <p className="house-card-name">{style.name}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </AppShell>
  );
}
