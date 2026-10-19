import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useNavigate, useRouter, Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Pencil, Radio, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { FollowButton } from "@/components/home/follow-button";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { StyleViewLink, useStylePin } from "@/components/labels/style-pin-note";
import { LookCanvas } from "@/components/looks/look-canvas";
import { LookShopSheet } from "@/components/looks/look-shop-sheet";
import { PieceThumb } from "@/components/looks/piece-thumb";
import { ECHO_FROM_KEY, echoKicker, pieceLine, recordEchoActivation } from "@/lib/home/echo";
import { shouldUseHistoryBack, markEditOpenedFromLook } from "@/lib/nav/back";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { tagOffers, visualShopTarget } from "@/lib/looks/offers";
import { placePinCard } from "@/lib/looks/pin-card";
import { retailerLabel } from "@/lib/looks/retailers";
import { useSavedLooks } from "@/lib/looks/saved";
import { useResumePendingSave } from "@/lib/looks/use-pending-save";
import { firstShopTag } from "@/lib/looks/shop-whole";
import { shareOrCopy } from "@/lib/looks/share";
import type { Look, ProductTag } from "@/lib/looks/types";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { useSettingsStore } from "@/lib/settings/store";

const FLAG_PHONE_QUERY = "(max-width: 767px)";

/** The Shop whole look flag applies below 768px (native app always counts as phone). */
function useFlagPhone() {
  const [phone, setPhone] = useState(true);
  useLayoutEffect(() => {
    const query = window.matchMedia(FLAG_PHONE_QUERY);
    const sync = () => setPhone(query.matches || document.documentElement.classList.contains("native-app"));
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return phone;
}

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
  useResumePendingSave(Boolean(user));
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const saved = useSavedLooks((s) => s.ids.includes(look.id));
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shopSheetOpen, setShopSheetOpen] = useState(false);
  const feedFollow = useSettingsStore((s) => s.feedFollow);
  const shopWholeLookPhone = useSettingsStore((s) => s.shopWholeLookPhone);
  const flagPhone = useFlagPhone();
  /** Below 768px the spotlight never shows Shop whole look; the sheet footer shows it only when the flag is on. */
  const showSpotlightWhole = !flagPhone;
  const showShopWhole = !flagPhone || shopWholeLookPhone;

  useEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  const swipeRef = useRef<number | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastIndexRef = useRef(0);
  const [plateSize, setPlateSize] = useState({ w: 0, h: 0 });
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
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

  /** Closes the spotlight and hands focus back to the pin that opened it. */
  const dismiss = useCallback(() => {
    setSelectedId(null);
    const pin = plateRef.current?.querySelectorAll<HTMLElement>(".tag-pin")[lastIndexRef.current];
    if (pin) requestAnimationFrame(() => pin.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (spotlightIndex >= 0) lastIndexRef.current = spotlightIndex;
  }, [spotlightIndex]);

  useEffect(() => {
    const node = plateRef.current;
    if (!node) return;
    const read = () => setPlateSize({ w: node.clientWidth, h: node.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /** Move focus into the card when it opens, and keep it clear of every other pin. */
  const hasSpotlight = Boolean(spotlight);
  useEffect(() => {
    if (hasSpotlight) cardRef.current?.focus({ preventScroll: true });
  }, [hasSpotlight]);

  useLayoutEffect(() => {
    const plate = plateRef.current;
    const card = cardRef.current;
    if (!plate || !card || !selectedId || plateSize.w === 0) {
      setCardPos(null);
      return;
    }
    const plateRect = plate.getBoundingClientRect();
    const pinNodes = plate.querySelectorAll<HTMLElement>(".tag-pin");
    const pins = look.tags.flatMap((tag, index) => {
      const rect = pinNodes[index]?.getBoundingClientRect();
      if (!rect) return [];
      return [{ id: tag.id, x: rect.left + rect.width / 2 - plateRect.left, y: rect.top + rect.height / 2 - plateRect.top }];
    });
    const meta = plate.querySelector<HTMLElement>(".look-plate-meta");
    const bar = plate.querySelector<HTMLElement>(".look-plate-bar");
    const cardRect = card.getBoundingClientRect();
    const placed = placePinCard({
      pins,
      selectedId,
      plate: { w: plateRect.width, h: plateRect.height },
      card: { w: cardRect.width, h: cardRect.height },
      inset: {
        top: (bar?.getBoundingClientRect().bottom ?? plateRect.top + 72) - plateRect.top + 4,
        bottom: meta ? plateRect.bottom - meta.getBoundingClientRect().top + 8 : 190,
      },
      margin: 16,
      pinRadius: 22,
      fixedX: plateRect.width < 768,
    });
    setCardPos({ top: placed.top, left: placed.left });
  }, [selectedId, look.tags, plateSize.w, plateSize.h]);

  /** Esc, arrow keys and taps on the bare plate act on this plate only, never on the whole document. */
  function onPlateKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selectedId) return;
    // React bubbles events out of portals (the account sheet); only keys typed inside the plate's own DOM belong here.
    if (event.defaultPrevented || sheetOpen || shopSheetOpen) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      dismiss();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      stepSpotlight(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  function onPlatePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!selectedId) return;
    const target = event.target as Element | null;
    if (!target?.closest(".look-plate-canvas")) return;
    if (target.closest(".tag-pin, .look-plate-piece")) return;
    setSelectedId(null);
  }

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
    // "noopener" in the features string makes window.open return null even when it worked, so detach the opener by hand.
    const win = window.open(target.url, "_blank");
    if (win) win.opener = null;
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
    const first = firstShopTag(look.tags);
    if (!first) {
      toast.message("No close match yet");
      return;
    }
    shop(first.tag);
  }

  /** `Shop this look`: the sheet lists every piece, so the pin card gives way to it. */
  function openShopSheet() {
    setSelectedId(null);
    setShopSheetOpen(true);
  }

  return (
    <div
      className="look-plate"
      ref={plateRef}
      data-sheet={shopSheetOpen ? "open" : undefined}
      onKeyDown={onPlateKeyDown}
      onPointerDown={onPlatePointerDown}
    >
      <LookCanvas
        imageSrc={look.imageSrc}
        title={look.title}
        tags={look.tags}
        crop={look.crop}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        fit="fill"
        className="look-plate-canvas"
      />
      {spotlight ? <div className="look-plate-vignette" aria-hidden /> : null}
      {spotlight ? (
        <div
          ref={cardRef}
          className="look-plate-piece"
          style={cardPos ? (plateSize.w >= 768 ? { top: cardPos.top, left: cardPos.left, right: "auto" } : { top: cardPos.top }) : undefined}
          tabIndex={-1}
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
            <button type="button" className="look-plate-piece-x" aria-label="Dismiss" onClick={dismiss}>
              <X className="size-4" />
            </button>
          </div>
          {stylePin || spotlightTarget ? (
            <div className="look-plate-piece-actions">
              {spotlightTarget ? (
                <button
                  type="button"
                  className="look-plate-piece-shop"
                  aria-label={`Shop ${spotlight.name || "piece"}`}
                  onClick={() => shop(spotlight)}
                >
                  Shop
                </button>
              ) : null}
              {stylePin ? <StyleViewLink pin={stylePin} className="look-plate-piece-view" /> : null}
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
                recordEchoActivation(look);
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
            showSpotlightWhole ? (
              <button
                type="button"
                className="look-plate-shop-whole"
                onClick={() => (look.tags.length ? openShopSheet() : toast.message("No pieces on this look yet"))}
              >
                Shop whole look
              </button>
            ) : null
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
        onShopWhole={showShopWhole ? shopWholeLook : undefined}
      />

      <AccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        intent="save"
        pendingSave={look.id}
        title="Sign in to save"
        description=""
        primary="Continue with email"
        secondary="Cancel"
      />
    </div>
  );
}
