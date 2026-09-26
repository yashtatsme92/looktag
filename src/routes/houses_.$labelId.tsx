import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Button } from "@/components/ui/button";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFashionLabel, type FashionLabelPage } from "@/lib/labels/api";
import { SCOUTED_FLAG, houseProfileLooks, toggleHouseFollow } from "@/lib/labels/model";
import { shareOrCopy } from "@/lib/looks/share";
import { recordShareView } from "@/lib/share/api";
import {
  houseShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

const FOLLOW_KEY = "looktag-followed-houses-v1";

function readFollows(): string[] {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

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
    const imageSrc = loaderData.house?.collection?.[0]?.imageSrc ?? "";
    return shareHead(houseShareMeta(label, loaderData.origin, imageSrc));
  },
  component: HouseProfile,
});

function HouseProfile() {
  const { labelId } = Route.useParams();
  const { house } = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const [sharing, setSharing] = useState(false);
  const [follows, setFollows] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setFollows(readFollows());
  }, []);

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

  const { label } = house;
  const looks = houseProfileLooks(house.collection ?? [], label);
  const following = follows.includes(label.id);

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

  function follow() {
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
      <article>
        <ScreenTitle kicker={label.city}>{label.name}</ScreenTitle>
        {label.scouted ? (
          <div className="mb-4 flex items-center gap-2">
            <ScoutedMark />
            <p className="text-sm text-muted-foreground">{SCOUTED_FLAG} — picked by Looktag.</p>
          </div>
        ) : null}
        {label.bio ? <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{label.bio}</p> : null}
        <button type="button" className="create-btn-primary mb-6 max-w-xs" onClick={follow}>
          {following ? "Following" : "Follow"}
        </button>
        {looks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No looks yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {looks.map((look) => (
              <li key={look.id}>
                <Link to="/looks/$lookId" params={{ lookId: look.id }} className="block">
                  <img
                    src={look.imageSrc}
                    alt=""
                    className="aspect-[2/3] w-full rounded-2xl object-cover"
                  />
                  <p className="mt-2 text-sm leading-snug">{look.title || "Untitled look"}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
      <AccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Sign in to continue"
        description="Follow stays on this house. Cancel returns here."
        intent="follow"
        next={`/houses/${label.id}`}
        primary="Continue with email"
        secondary="Cancel"
      />
    </AppShell>
  );
}
