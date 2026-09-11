import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { CollectionCard } from "@/components/labels/collection-card";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Button } from "@/components/ui/button";
import { getFashionLabel, type FashionLabelPage } from "@/lib/labels/api";
import { SCOUTED_FLAG } from "@/lib/labels/model";
import { shareOrCopy } from "@/lib/looks/share";
import { moodLabel } from "@/lib/looks/moods";
import { recordShareView } from "@/lib/share/api";
import {
  houseShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

export const Route = createFileRoute("/houses_/$labelId")({
  ssr: true,
  loader: async ({ params }) => {
    try {
      const data = await getFashionLabel({ data: params.labelId });
      const share = await recordShareView({
        data: { kind: "house", id: params.labelId, found: Boolean(data) },
      });
      return { house: data as FashionLabelPage | null, origin: share.origin };
    } catch {
      return { house: null, origin: "" };
    }
  },
  headers: ({ loaderData }) => shareCacheHeaders(Boolean(loaderData?.house)),
  head: ({ loaderData }) => {
    const label = loaderData?.house?.label;
    if (!label) return notFoundShareHead("house");
    const imageSrc =
      loaderData.house?.collections?.[0]?.looks?.[0]?.imageSrc ??
      loaderData.house?.collection?.[0]?.imageSrc ??
      "";
    return shareHead(houseShareMeta(label, loaderData.origin, imageSrc));
  },
  component: HouseProfile,
});

type HousePayload = FashionLabelPage;

function HouseProfile() {
  const { labelId } = Route.useParams();
  const { house } = Route.useLoaderData();
  const [sharing, setSharing] = useState(false);

  if (!house) {
    return (
      <AppShell title="House" backTo="/houses">
        <h1 className="ds-screen-title">House not found</h1>
        <p className="mt-3 text-muted-foreground">This label is not on Looktag yet.</p>
        <Button asChild className="mt-6">
          <Link to="/houses">Back to houses</Link>
        </Button>
      </AppShell>
    );
  }

  const { label, collections } = house as HousePayload;

  async function shareHouse() {
    setSharing(true);
    const url = `${window.location.origin}/houses/${labelId}`;
    const result = await shareOrCopy({
      title: label.name,
      text: label.bio || `${label.name} on Looktag`,
      url,
      kind: "house",
    });
    setSharing(false);
    if (result === "copied") toast.success("Link copied");
    if (result === "shown") toast.message("Share this house", { description: url });
  }

  return (
    <AppShell
      title={label.name}
      backTo="/houses"
      trailing={
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Share house"
          disabled={sharing}
          onClick={() => void shareHouse()}
        >
          <Share2 className="size-5" />
        </Button>
      }
    >
      <article className="house-layout">
        <ScreenTitle kicker={label.city}>{label.name}</ScreenTitle>
        {label.scouted ? (
          <div className="mb-4 flex items-center gap-2">
            <ScoutedMark />
            <p className="text-sm text-muted-foreground">
              {SCOUTED_FLAG} — picked by Looktag.
            </p>
          </div>
        ) : null}
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{label.bio}</p>
        {label.moods.length > 0 ? (
          <p className="mb-6 text-xs tracking-[0.14em] text-muted-foreground uppercase">
            {label.moods.map(moodLabel).join(" · ")}
          </p>
        ) : null}

        <h2 className="ds-section-title mb-1">Collections</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {collections.length} {collections.length === 1 ? "collection" : "collections"}
          {" · "}
          {house.looks} {house.looks === 1 ? "look" : "looks"}
        </p>
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collections published yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {collections.map((row) => (
              <CollectionCard
                key={row.collection.id}
                labelId={label.id}
                collection={row.collection}
                cover={row.looks[0]}
                looks={row.looks.length}
              />
            ))}
          </div>
        )}

        <details className="mt-8 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
            House details
            <span className="text-xs font-normal text-muted-foreground">Score · Compared</span>
          </summary>
          <dl className="grid grid-cols-2 gap-2 border-t border-border p-4 text-center sm:grid-cols-4">
            <Stat label="Score" value={String(house.score)} />
            <Stat label="Collections" value={String(house.collections.length)} />
            <Stat label="Looks" value={String(house.looks)} />
            <Stat label="Compared" value={String(house.compared)} />
          </dl>
        </details>
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
