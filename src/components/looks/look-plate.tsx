import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouter, Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Pencil, Radio, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { FollowButton } from "@/components/home/follow-button";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { useStylePin } from "@/components/labels/style-pin-note";
import { LookCanvas } from "@/components/looks/look-canvas";
import { LookShopSheet } from "@/components/looks/look-shop-sheet";
import { PieceThumb } from "@/components/looks/piece-thumb";
import { ECHO_FROM_KEY, echoKicker, pieceLine } from "@/lib/home/echo";
import { shouldUseHistoryBack, markEditOpenedFromLook } from "@/lib/nav/back";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { tagOffers, visualShopTarget } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import { useSavedLooks } from "@/lib/looks/saved";
import { shareOrCopy } from "@/lib/looks/share";
import type { Look, ProductTag } from "@/lib/looks/types";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { useSettingsStore } from "@/lib/settings/store";

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
  const [shopSheetOpen, setShopSheetOpen] = useState(false);
  const feedFollow = useSettingsStore((s) => s.feedFollow);

  useEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  const swipeRef = useRef<number | null>(null);
  const focus = look.tags.find((tag) => tag.id === selectedId) ?? look.tags[0] ?? null;
  const spotlight = selectedId ? (look.tags.find((tag) => tag.id === selectedId) ?? null) : null;
  const spotlightIndex = spotlight ? look.tags.indexOf(spotlight) : -1;
  const stylePin = useStylePin(spotlight?.styleId);
  const spotlightTarget = spotlight ? visualShopTarget(spotlight) : null;

  /** Swipe the piece card to move to the next or previous pin. */
  function stepSpotlight(direction: 1 | -1) {
    if (look.tags.length < 2 || spotlightIndex < 0) return;
    const next = (spotlightIndex + direction + look.tags.length) % look.tags.length;
    setSelectedId(look.tags[next].id);
  }
  const kicker = echoKicker(look);

  /** Esc, or a tap on the bare plate, clears the spotlight. Pins and the card keep it. */
  useEffect(() => {
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Esc belongs to whichever sheet is open (account sheet, Shop sheet); only a bare Esc clears the spotlight.
      if (event.defaultPrevented || sheetOpen || shopSheetOpen) return;
      if ((event.target as Element | null)?.closest?.("[data-vaul-drawer], .look-sheet")) return;
      setSelectedId(null);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (!target?.closest(".look-plate-canvas")) return;
      if (target.closest(".tag-pin, .look-plate-piece")) return;
      setSelectedId(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selectedId, sheetOpen, shopSheetOpen]);

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

  /** One destination per tap: the first pin that has a visual shop target. */
  function shopWholeLook() {
    const tag = look.tags.find((item) => visualShopTarget(item)?.url);
    if (!tag) {
      toast.message("No close match yet");
      return;
    }
    shop(tag);
  }

  /** `Shop this look`: the sheet lists every piece, so the pin card gives way to it. */
  function openShopSheet() {
    setSelectedId(null);
    setShopSheetOpen(true);
  }

  return (
    <div className="look-plate" data-sheet={shopSheetOpen ? "open" : undefined}>
      <LookCanvas
        imageSrc={look.imageSrc}
        title={look.title}
        tags={look.tags}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        fit="fill"
        className="look-plate-canvas"
      />
      {spotlight ? <div className="look-plate-vignette" aria-hidden /> : null}
      {spotlight ? (
        <div
          className="look-plate-piece"
          data-side={spotlight.y > 50 ? "top" : "bottom"}
          data-h={spotlight.x > 50 ? "left" : "right"}
          role="dialog"
          aria-label="Selected piece"
          onPointerDown={(event) => {
            swipeRef.current = event.clientX;
          }}
          onPointerUp={(event) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            if (start === null) return;
            const dx = event.clientX - start;
            if (Math.abs(dx) > 48) stepSpotlight(dx < 0 ? 1 : -1);
          }}
        >
          <div className="look-plate-piece-row">
            <PieceThumb
              lookSrc={look.imageSrc}
              x={spotlight.x}
              y={spotlight.y}
              productSrc={tagOffers(spotlight).find((offer) => offer.imageUrl)?.imageUrl}
              size="md"
            />
            <div className="look-plate-piece-text">
              {stylePin ? (
                <>
                  <span className="look-plate-piece-name">{stylePin.styleName}</span>
                  <span className="look-plate-piece-retailer">{stylePin.houseName}</span>
                </>
              ) : (
                <>
                  <span className="look-plate-piece-name">{spotlight.name || "Piece"}</span>
                  <span className="look-plate-piece-retailer">
                    {spotlightTarget ? retailerLabel(spotlight) : "No close match yet"}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              className="look-plate-piece-x"
              aria-label="Dismiss"
              onClick={() => setSelectedId(null)}
            >
              <X className="size-4" />
            </button>
          </div>
          {stylePin || spotlightTarget ? (
            <div className="look-plate-piece-actions">
              {stylePin ? (
                <Link
                  to="/houses/$labelId/$collectionId/$styleId"
                  params={{
                    labelId: stylePin.labelId,
                    collectionId: stylePin.lineSlug,
                    styleId: stylePin.styleId,
                  }}
                  className="look-plate-piece-view"
                >
                  View Style
                </Link>
              ) : null}
              {spotlightTarget ? (
                <button type="button" className="look-plate-piece-shop" onClick={() => shop(spotlight)}>
                  Shop
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
              onClick={() => markEditOpenedFromLook(look.id)}
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
            <HangtagIcon className="size-5" filled={saved} />
          </button>
        </div>
      </header>
      <div className="look-plate-meta">
        {kicker || (feedFollow && look.userId) ? (
          <span className="echo-kicker-row">
            {kicker ? <p className="look-plate-kicker">{kicker}</p> : null}
            {feedFollow && look.userId ? (
              <FollowButton creatorId={look.userId} name={look.creator || "this creator"} />
            ) : null}
          </span>
        ) : null}
        <h1 className="look-plate-title">{look.title || "Untitled look"}</h1>
        <span className="look-plate-rule" />
        <div className="flex items-end justify-between gap-3">
          <div>
            {pieceLine(look) ? (
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
          {spotlight ? (
            <button
              type="button"
              className="look-plate-shop-whole"
              onClick={() => (look.tags.length ? openShopSheet() : toast.message("No pieces on this look yet"))}
            >
              Shop whole look
            </button>
          ) : (
            <button type="button" className="look-plate-shop" onClick={() => (look.tags.length ? openShopSheet() : toast.message("No pieces on this look yet"))}>
              Shop
              <ExternalLink className="size-4" />
            </button>
          )}
        </div>
      </div>

      <LookShopSheet
        tags={look.tags}
        open={shopSheetOpen}
        onClose={() => setShopSheetOpen(false)}
        onShopPiece={shop}
        onShopWhole={shopWholeLook}
      />

      <AccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        intent="save"
        title="Sign in to save"
        description="Save stays on this look. Cancel returns here."
        primary="Continue with email"
        secondary="Cancel"
      />
    </div>
  );
}
