import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Button } from "@/components/ui/button";
import { FadeLayer } from "@/components/ds/fade-layer";
import { ImgSlot } from "@/components/ds/img-slot";
import { SkeletonGrid } from "@/components/ds/skeleton";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFashionLabel, getHousesAvailability, type FashionLabelPage } from "@/lib/labels/api";
import { houseCoverSrc, publicLines, toggleHouseFollow, type FashionLabel } from "@/lib/labels/model";
import { loadingCache } from "@/lib/loading/cache";
import { clientDeferred, isDeferred, useRouteLoad } from "@/lib/loading/route-load";
import { shareOrCopy } from "@/lib/looks/share";
import { recordShareView } from "@/lib/share/api";
import {
  houseShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

const FOLLOW_KEY = "looktag-followed-houses-v1";

type HouseProfileData = {
  open: boolean;
  house: FashionLabelPage | null;
  origin: string;
};

function readFollows(): string[] {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function cachedHouse(labelId: string): { label: FashionLabel; cover: string } | null {
  const entry = loadingCache.get<{ labels: FashionLabel[]; covers: Record<string, string> }>("houses:index");
  const label = entry?.value.labels.find((item) => item.id === labelId);
  if (!label) return null;
  return { label, cover: label.coverSrc || entry?.value.covers[label.id] || "" };
}

async function loadHouseProfile(labelId: string): Promise<HouseProfileData> {
  try {
    const open = await getHousesAvailability();
    if (!open) return { open: false, house: null, origin: "" };
    const data = await getFashionLabel({ data: labelId });
    const share = await recordShareView({
      data: { kind: "house", id: labelId, found: Boolean(data) },
    });
    return { open: true, house: data as FashionLabelPage | null, origin: share.origin };
  } catch {
    return { open: true, house: null, origin: "" };
  }
}

export const Route = createFileRoute("/houses_/$labelId")({
  ssr: true,
  loader: ({ params }) => clientDeferred(() => loadHouseProfile(params.labelId), `house:${params.labelId}`),
  headers: ({ loaderData }) => {
    if (!loaderData || isDeferred(loaderData)) return {};
    return shareCacheHeaders(Boolean(loaderData.house));
  },
  head: ({ loaderData }) => {
    if (!loaderData || isDeferred(loaderData)) return { meta: [{ title: "House — Looktag" }] };
    const label = loaderData.house?.label;
    if (!label) return notFoundShareHead("house");
    const imageSrc = label.coverSrc || loaderData.house?.styles[0]?.imageSrc || "";
    return shareHead(houseShareMeta(label, loaderData.origin, imageSrc));
  },
  component: HouseProfile,
});

function HouseHeader({
  label,
  cover,
  following,
  onFollow,
}: {
  label: FashionLabel;
  cover: string;
  following: boolean;
  onFollow: () => void;
}) {
  const line = label.bio?.trim() || label.city?.trim() || "";
  return (
    <div className="house-profile-hero">
      {cover ? <img className="house-hero" src={cover} alt="" /> : null}
      <div className="house-profile-info">
        <p className="wide-kicker">House</p>
        <ScreenTitle>{label.name}</ScreenTitle>
        {label.scouted ? (
          <p className="house-profile-scout">
            <span className="scouted-dot" aria-hidden />
            Scouted
          </p>
        ) : null}
        {line ? <p className="house-line">{line}</p> : null}
        <button type="button" className="house-primary house-follow" onClick={onFollow}>
          {following ? "Following" : "Follow"}
        </button>
      </div>
    </div>
  );
}

function HouseProfile() {
  const { labelId } = Route.useParams();
  const seeded = Route.useLoaderData();
  const houseLoad = useRouteLoad(seeded, `house:${labelId}`, () => loadHouseProfile(labelId));
  const data = houseLoad.data;
  const closed = useHousesClosed(data ? data.open : true);
  const { user, isPending } = useCurrentUserState();
  const [sharing, setSharing] = useState(false);
  const [follows, setFollows] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setFollows(readFollows());
  }, []);

  if (closed) return <HousesClosed />;

  const house = data?.house ?? null;
  const pending = !data && !houseLoad.error;
  const cached = cachedHouse(labelId);
  const label = house?.label ?? cached?.label;

  if (!pending && !houseLoad.skeleton && !houseLoad.error && !house) {
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

  const lines = house ? publicLines(house.lines, house.styles) : [];
  const following = label ? follows.includes(label.id) : false;
  const cover = house ? houseCoverSrc(lines, house.label.coverSrc) : (cached?.cover ?? "");
  const stateKey = houseLoad.error ? "error" : houseLoad.skeleton ? "skeleton" : pending ? "waiting" : "ready";

  async function shareHouse() {
    if (!label) return;
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

  function follow() {
    if (!label) return;
    if (authEnabled && !isPending && !user) {
      setSheetOpen(true);
      return;
    }
    const next = toggleHouseFollow(follows, label.id);
    setFollows(next);
    try {
      localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
    } catch {
      // private mode
    }
    toast.success(next.includes(label.id) ? `Following ${label.name}` : `Unfollowed ${label.name}`);
  }

  return (
    <AppShell
      title={label?.name ?? "House"}
      backTo="/houses"
      trailing={
        label ? (
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
        ) : null
      }
    >
      <FadeLayer stateKey={stateKey}>
        {houseLoad.error ? (
          <p className="text-sm text-muted-foreground">Houses aren't available right now</p>
        ) : houseLoad.skeleton ? (
          <article className="house-profile">
            {label ? <HouseHeader label={label} cover={cover} following={following} onFollow={follow} /> : null}
            <div className="house-profile-lines">
              <h2 className="ops-section house-looks-title">Lines</h2>
              <SkeletonGrid count={4} captions />
            </div>
          </article>
        ) : pending ? (
          label ? (
            <article className="house-profile">
              <HouseHeader label={label} cover={cover} following={following} onFollow={follow} />
            </article>
          ) : null
        ) : label && house ? (
          <article className="house-profile">
            <HouseHeader label={label} cover={cover} following={following} onFollow={follow} />
            <div className="house-profile-lines">
              <h2 className="ops-section house-looks-title">Lines</h2>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Lines yet.</p>
              ) : (
                <ul className="house-lines">
                  {lines.map(({ collection, styles }) => (
                    <li key={collection.id}>
                      <Link
                        to="/houses/$labelId/$collectionId"
                        params={{ labelId: label.id, collectionId: collection.slug }}
                        className="house-card"
                        aria-label={`${collection.name}, Line`}
                      >
                        <ImgSlot src={styles[0]?.imageSrc} alt="" slotClassName="img-slot-fill" />
                        <div className="house-card-caption">
                          <span className="house-card-scout">Line</span>
                          <p className="house-card-name">{collection.name}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ) : null}
      </FadeLayer>
      {label ? (
        <AccountSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Sign in to follow"
          description="Follow stays on this house. Cancel returns here."
          intent="follow"
          next={`/houses/${label.id}`}
          primary="Continue with email"
          secondary="Cancel"
        />
      ) : null}
    </AppShell>
  );
}
