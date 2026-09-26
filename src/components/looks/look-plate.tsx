import { useEffect, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Bookmark, ChevronLeft, ExternalLink, Radio, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { LookCanvas } from "@/components/looks/look-canvas";
import { ECHO_FROM_KEY, echoKicker, pieceLine } from "@/lib/home/echo";
import { listFashionLabels } from "@/lib/labels/api";
import { looksBelongToHouse, type FashionLabel } from "@/lib/labels/model";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { visualShopTarget } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import { useSavedLooks } from "@/lib/looks/saved";
import { shareOrCopy } from "@/lib/looks/share";
import type { Look, ProductTag } from "@/lib/looks/types";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export function LookPlate({
  look,
  userState,
}: {
  look: Look;
  userState?: FunnelUserState;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const saved = useSavedLooks((s) => s.ids.includes(look.id));
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
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
  const house = labels.find((label) => looksBelongToHouse(look, label))?.name;

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
    if (result === "copied") toast.success("Link copied");
  }

  function openShop(tag: ProductTag | null) {
    if (!tag) {
      toast.message("No pieces on this look yet");
      return;
    }
    setSelectedId(tag.id);
    setShopOpen(true);
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
        onSelect={(id) => {
          setSelectedId(id);
          if (id) setShopOpen(true);
        }}
        fit="fill"
        className="look-plate-canvas"
      />
      <header className="look-plate-bar">
        <button
          type="button"
          className="look-plate-glass"
          aria-label="Back"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
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
        <p className="look-plate-kicker">{echoKicker(look, house)}</p>
        <h1 className="look-plate-title">{look.title || "Untitled look"}</h1>
        <span className="look-plate-rule" />
        <div className="flex items-end justify-between gap-3">
          <div>
            {pieceLine(look) ? <p className="look-plate-pieces">{pieceLine(look)}</p> : null}
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
          <button type="button" className="look-plate-shop" onClick={() => openShop(focus)}>
            Shop
            <ExternalLink className="size-4" />
          </button>
        </div>
      </div>

      <Drawer open={shopOpen} onOpenChange={setShopOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{focus?.name.trim() || "Shop"}</DrawerTitle>
            <DrawerDescription>
              {focus ? retailerLabel(visualShopTarget(focus) ?? focus) : "No pieces on this look."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-5 pb-6">
            {focus ? (
              <button type="button" className="look-plate-shop look-plate-shop-ink" onClick={() => shop(focus)}>
                Shop
                <ExternalLink className="size-4" />
              </button>
            ) : null}
            {look.tags.length > 1 ? (
              <ul className="mt-2 flex flex-col">
                {look.tags.map((tag, index) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 text-left text-sm",
                        tag.id === focus?.id ? "font-semibold" : "text-muted-foreground",
                      )}
                      onClick={() => setSelectedId(tag.id)}
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-xs text-background">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{tag.name || `Piece ${index + 1}`}</span>
                      <span className="truncate text-xs">{retailerLabel(visualShopTarget(tag) ?? tag)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
      <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
