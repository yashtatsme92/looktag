import { useEffect, useState } from "react";
import { useNavigate, useRouter, Link } from "@tanstack/react-router";
import { Bookmark, ChevronLeft, ExternalLink, Pencil, Radio, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { LookCanvas } from "@/components/looks/look-canvas";
import { ECHO_FROM_KEY, echoKicker, pieceLine } from "@/lib/home/echo";
import { shouldUseHistoryBack } from "@/lib/nav/back";
import { listFashionLabels } from "@/lib/labels/api";
import { looksBelongToHouse, type FashionLabel } from "@/lib/labels/model";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { visualShopTarget } from "@/lib/looks/offers";
import { useSavedLooks } from "@/lib/looks/saved";
import { shareOrCopy } from "@/lib/looks/share";
import type { Look, ProductTag } from "@/lib/looks/types";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { cn } from "@/lib/utils";

export function LookPlate({
  look,
  userState,
  canEdit = false,
}: {
  look: Look;
  userState?: FunnelUserState;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const saved = useSavedLooks((s) => s.ids.includes(look.id));
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labels, setLabels] = useState<FashionLabel[]>([]);

  useEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  useEffect(() => {
    let alive = true;
    void listFashionLabels()
      .then((rows) => {
        if (alive) setLabels(rows);
      })
      .catch(() => {
        if (alive) setLabels([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const focus = look.tags.find((tag) => tag.id === selectedId) ?? look.tags[0] ?? null;
  const house = labels.find((label) => looksBelongToHouse(look, label));

  function save() {
    if (authEnabled && !isPending && !user) {
      setSheetOpen(true);
      return;
    }
    const next = toggleSaved(look.id);
    toast.success(next ? "Saved" : "Removed from wardrobe");
  }

  async function share() {
    const url = `${window.location.origin}/looks/${look.id}`;
    const result = await shareOrCopy({
      title: look.title,
      text: look.caption || `${look.title} on Looktag`,
      url,
      kind: "look",
    });
    if (result === "shared") toast.success("Shared");
    else if (result === "copied") toast.success("Link copied");
    else toast.message(url);
  }

  function shop(tag: ProductTag) {
    const target = visualShopTarget(tag);
    if (!target?.url) {
      toast.message("No shop for this piece yet");
      return;
    }
    const win = window.open(target.url, "_blank", "noopener,noreferrer");
    if (!win) {
      toast.message("Allow pop-ups to open the shop");
      return;
    }
    recordOutboundShopClick({
      chrome: chromeLayout(),
      lookId: look.id,
      offerCount: 1,
      retailerId: target.retailerId,
      source: "piece_shop",
      tagId: tag.id,
      urlHost: hostFromUrl(target.url),
      userState,
    });
  }

  return (
    <div className="look-plate">
      <LookCanvas
        imageSrc={look.imageSrc}
        title={look.title}
        tags={look.tags}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        fit="fill"
        className="look-plate-canvas"
      />
      <header className="look-plate-bar">
        <button
          type="button"
          className="look-plate-glass"
          aria-label="Back"
          onClick={() => {
            if (typeof window !== "undefined" && shouldUseHistoryBack(window.history.state)) {
              router.history.back();
              return;
            }
            void navigate({ to: "/" });
          }}
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="flex gap-2">
          <button type="button" className="look-plate-glass" aria-label="Share" onClick={() => void share()}>
            <Share2 className="size-5" />
          </button>
          {canEdit ? (
            <Link
              to="/looks/$lookId/edit"
              params={{ lookId: look.id }}
              className="look-plate-glass"
              aria-label="Edit look"
            >
              <Pencil className="size-5" />
            </Link>
          ) : null}
          <button
            type="button"
            className="look-plate-glass"
            aria-label={saved ? "Remove saved look" : "Save look"}
            aria-pressed={saved}
            onClick={save}
          >
            <Bookmark className={cn("size-5", saved && "fill-current")} />
          </button>
        </div>
      </header>
      <div className="look-plate-meta">
        {house ? (
          <Link to="/houses/$labelId" params={{ labelId: house.id }} className="look-plate-kicker">
            {echoKicker(look, house.name)}
          </Link>
        ) : (
          <p className="look-plate-kicker">{echoKicker(look)}</p>
        )}
        <h1 className="look-plate-title">{look.title || "Untitled look"}</h1>
        <span className="look-plate-rule" />
        <div className="flex items-end justify-between gap-3">
          <div>
            {selectedId && focus?.name ? (
              <p className="look-plate-pieces">{focus.name}</p>
            ) : pieceLine(look) ? (
              <p className="look-plate-pieces">{pieceLine(look)}</p>
            ) : null}
            <button
              type="button"
              className="look-plate-echo"
              onClick={() => {
                try {
                  sessionStorage.setItem(ECHO_FROM_KEY, look.id);
                } catch {
                  // private mode
                }
                void navigate({ to: "/" });
              }}
            >
              <Radio className="size-4" />
              Echo
            </button>
          </div>
          <button type="button" className="look-plate-shop" onClick={() => (focus ? shop(focus) : toast.message("No pieces on this look yet"))}>
            Shop
            <ExternalLink className="size-4" />
          </button>
        </div>
      </div>

      <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
