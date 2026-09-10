import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { LookCard } from "@/components/looks/look-card";
import { Button } from "@/components/ui/button";
import { getFashionCollection, type FashionCollectionPage } from "@/lib/labels/api";
import { SCOUTED_FLAG } from "@/lib/labels/model";
import { moodLabel } from "@/lib/looks/moods";
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
      return { page: data as FashionCollectionPage | null, origin: share.origin };
    } catch {
      return { page: null, origin: "" };
    }
  },
  headers: ({ loaderData }) => shareCacheHeaders(Boolean(loaderData?.page)),
  head: ({ loaderData }) => {
    const page = loaderData?.page;
    if (!page) return notFoundShareHead("collection");
    const imageSrc = page.looks[0]?.imageSrc ?? "";
    return shareHead(collectionShareMeta(page.label, page.collection, loaderData.origin, imageSrc));
  },
  component: CollectionPage,
});

function CollectionPage() {
  const { labelId, collectionId } = Route.useParams();
  const { page } = Route.useLoaderData();
  const [sharing, setSharing] = useState(false);

  if (!page) {
    return (
      <AppShell title="Collection" backTo={`/houses/${labelId}`}>
        <h1 className="ds-screen-title">Collection not found</h1>
        <p className="mt-3 text-muted-foreground">This lookbook is not on Looktag yet.</p>
        <Button asChild className="mt-6">
          <Link to="/houses/$labelId" params={{ labelId }}>
            Back to house
          </Link>
        </Button>
      </AppShell>
    );
  }

  const { label, collection, looks } = page;

  async function shareCollection() {
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
    if (result === "shown") toast.message("Share this collection", { description: url });
  }

  return (
    <AppShell
      title={collection.name}
      backTo={`/houses/${label.id}`}
      trailing={
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Share collection"
          disabled={sharing}
          onClick={() => void shareCollection()}
        >
          <Share2 className="size-5" />
        </Button>
      }
    >
      <article>
        <ScreenTitle kicker={collection.season || label.name}>{collection.name}</ScreenTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          <Link
            to="/houses/$labelId"
            params={{ labelId: label.id }}
            className="underline-offset-2 hover:underline"
          >
            {label.name}
          </Link>
          {label.city ? ` · ${label.city}` : ""}
        </p>
        {label.scouted ? (
          <div className="mb-4 flex items-center gap-2">
            <ScoutedMark />
            <p className="text-sm text-muted-foreground">
              {SCOUTED_FLAG} house — picked by Looktag.
            </p>
          </div>
        ) : null}
        {collection.caption ? (
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{collection.caption}</p>
        ) : null}
        <dl className="mb-6 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Stat label="Looks" value={String(looks.length)} />
          <Stat label="Pins" value={String(page.pins)} />
        </dl>
        {collection.moods.length > 0 ? (
          <p className="mb-6 text-xs tracking-[0.14em] text-muted-foreground uppercase">
            {collection.moods.map(moodLabel).join(" · ")}
          </p>
        ) : null}
        <h2 className="ds-section-title mb-3">Looks</h2>
        {looks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No looks in this collection yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {looks.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </div>
        )}
      </article>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card px-2 py-3 shadow-[var(--shadow-border)]">
      <dt className="break-words text-[0.65rem] leading-snug tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums leading-tight">{value}</dd>
    </div>
  );
}
