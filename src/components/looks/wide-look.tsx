import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Radio, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { LookCanvas } from "@/components/looks/look-canvas";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ECHO_FROM_KEY, echoKicker, forYouOrder, pieceLine, recordEchoActivation } from "@/lib/home/echo";
import { FEED_LESS_KEY, readStoredIds } from "@/lib/home/follows";
import { useEchoLane } from "@/lib/home/use-echo-lane";
import { markEditOpenedFromLook, shouldUseHistoryBack } from "@/lib/nav/back";
import { StyleViewLink, useStylePin } from "@/components/labels/style-pin-note";
import { FollowButton } from "@/components/home/follow-button";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { visualShopTarget } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import { useSavedLooks } from "@/lib/looks/saved";
import { useResumePendingSave } from "@/lib/looks/use-pending-save";
import { firstShopTag } from "@/lib/looks/shop-whole";
import { shareOrCopy } from "@/lib/looks/share";
import { useLooksStore } from "@/lib/looks/store";
import { useSettingsStore } from "@/lib/settings/store";
import type { Look, ProductTag } from "@/lib/looks/types";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { cn } from "@/lib/utils";

export function WideLook({
  look,
  userState,
  canEdit = false,
}: {
  look: Look;
  userState?: FunnelUserState;
  canEdit?: boolean;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const looks = useLooksStore((s) => s.looks);
  const { user, isPending } = useCurrentUserState();
  useResumePendingSave(Boolean(user));
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const saved = useSavedLooks((s) => s.ids.includes(look.id));
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  const savedIds = useSavedLooks((s) => s.ids);
  const feedSavesOn = useSettingsStore((s) => s.feedSaves);
  const feedFreshOn = useSettingsStore((s) => s.feedFresh);
  const freshWindow = useSettingsStore((s) => s.feedFreshWindow);
  const [now] = useState(() => Date.now());
  const deck = useMemo(() => looks.filter((item) => item.imageSrc), [looks]);
  const forYou = useMemo(
    () => forYouOrder(deck, { lessIds: readStoredIds(FEED_LESS_KEY), savedIds, savesOn: feedSavesOn, freshOn: feedFreshOn, now, freshWindow }),
    [deck, feedFreshOn, feedSavesOn, freshWindow, now, savedIds],
  );
  const lane = useEchoLane(look, deck, forYou, { limit: 4 });
  const echo = useMemo(() => lane.slice(0, 4), [lane]);

  function openShop(tag: ProductTag, source: "piece_shop" | "shop_look") {
    const target = visualShopTarget(tag);
    if (!target?.url) return false;
    // "noopener" in the features string makes window.open return null even when it worked, so detach the opener by hand.
    const win = window.open(target.url, "_blank");
    if (win) win.opener = null;
    if (!win) return false;
    recordOutboundShopClick({
      chrome: chromeLayout(),
      lookId: look.id,
      offerCount: 1,
      retailerId: target.retailerId,
      source,
      tagId: tag.id,
      urlHost: hostFromUrl(target.url),
      userState,
    });
    return true;
  }

  function shopPiece(tag: ProductTag) {
    if (!visualShopTarget(tag)?.url) {
      toast.message("No close match yet");
      return;
    }
    if (!openShop(tag, "piece_shop")) toast.message("Allow pop-ups to open the shop");
  }

  /** One destination, never one window per piece: the first pin that has a visual shop target. */
  function shopWhole() {
    const first = firstShopTag(look.tags);
    if (!first) {
      toast.message("No close match yet");
      return;
    }
    if (!openShop(first.tag, "shop_look")) toast.message("Allow pop-ups to open the shop");
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
    if (result === "copied") toast.success("Link copied");
    else if (result === "shared") toast.success("Shared");
    else toast.message("Share this look", { description: url });
    setShareOpen(false);
  }

  return (
    <div className="wide-look">
      <div className="wide-wrap">
        <div className="wide-lookbar">
          <button
            type="button"
            className="wide-btn wide-btn-ghost"
            aria-label="Back"
            onClick={() => {
              if (typeof window !== "undefined" && shouldUseHistoryBack(window.history.state)) {
                router.history.back();
                return;
              }
              void navigate({ to: "/" });
            }}
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
        </div>
        <div className="wide-split">
          <div className="wide-plate">
            <LookCanvas
              imageSrc={look.imageSrc}
              title={look.title}
              tags={look.tags}
              crop={look.crop}
              selectedId={selectedId}
              onSelect={setSelectedId}
              fit="cover"
              className="wide-plate-canvas"
            />
          </div>
          <aside className="wide-panel" aria-label="Shop">
            <div className="wide-panel-hd">
              <span className="echo-kicker-row">
                <p className="wide-kicker">{echoKicker(look)}</p>
                {look.userId ? (
                  <FollowButton creatorId={look.userId} name={look.creator || "this creator"} tone="paper" />
                ) : null}
              </span>
              <h1>{look.title || "Untitled look"}</h1>
              <div className="wide-acts">
                <button
                  type="button"
                  className={cn("wide-btn wide-btn-sq wide-btn-ghost", saved && "is-saved")}
                  aria-label={saved ? "Remove saved look" : "Save"}
                  aria-pressed={saved}
                  onClick={save}
                >
                  <HangtagIcon className="size-5" filled={saved} />
                </button>
                <button
                  type="button"
                  className="wide-btn wide-btn-ghost"
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
                <button
                  type="button"
                  className="wide-btn wide-btn-sq wide-btn-ghost"
                  aria-label="Share"
                  aria-expanded={shareOpen}
                  onClick={() => setShareOpen((open) => !open)}
                >
                  <Share2 className="size-5" />
                </button>
                {canEdit ? (
                  <Link
                    to="/looks/$lookId/edit"
                    params={{ lookId: look.id }}
                    className="wide-btn wide-btn-ghost"
                    onClick={() => markEditOpenedFromLook(look.id)}
                  >
                    Edit
                  </Link>
                ) : null}
              </div>
              {shareOpen ? (
                <div className="wide-share" role="dialog" aria-label="Share">
                  <p className="wide-kicker">Share this look</p>
                  <button type="button" className="wide-btn wide-btn-primary wide-btn-block" onClick={() => void share()}>
                    Copy link
                  </button>
                </div>
              ) : null}
            </div>
            <div className="wide-panel-bd">
              <div className="wide-sech">
                <h2>Shop this look</h2>
                <span>{pieceLine(look) || "No pieces"}</span>
              </div>
              {look.tags.map((tag, index) => (
                <WidePieceRow
                  key={tag.id}
                  tag={tag}
                  index={index}
                  lookSrc={look.imageSrc}
                  selected={tag.id === selectedId}
                  onToggle={() => setSelectedId(tag.id === selectedId ? null : tag.id)}
                  onShop={() => shopPiece(tag)}
                />
              ))}
            </div>
            <div className="wide-panel-ft">
              <button type="button" className="wide-btn wide-btn-ghost wide-btn-block" onClick={shopWhole}>
                Shop whole look
              </button>
            </div>
          </aside>
        </div>

        {echo.length > 0 ? (
          <section className="wide-echo" aria-label="Echo">
            <div className="wide-echo-hd">
              <p className="wide-kicker">More like this look</p>
              <h2>Echo from {look.title || "this look"}</h2>
            </div>
            <div className="wide-grid">
              {echo.map((item) => (
                <article key={item.id} className="wide-tile">
                  <Link to="/looks/$lookId" params={{ lookId: item.id }} className="wide-tile-hit" aria-label={item.title || "Look"}>
                    <img src={item.imageSrc} alt="" />
                  </Link>
                  <div className="wide-tile-cap">
                    <p className="wide-kicker">{echoKicker(item)}</p>
                    <h3>{item.title || "Untitled look"}</h3>
                    <div className="wide-tile-row">
                      <span>{pieceLine(item)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
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

/** One piece in the desktop panel. A Style-linked pin shows the Style name and House, with a ghost View Style beside Shop. */
function WidePieceRow({
  tag,
  index,
  lookSrc,
  selected,
  onToggle,
  onShop,
}: {
  tag: ProductTag;
  index: number;
  lookSrc: string;
  selected: boolean;
  onToggle: () => void;
  onShop: () => void;
}) {
  const stylePin = useStylePin(tag.styleId);
  const target = visualShopTarget(tag);
  const pieceName = tag.name || "Piece";
  return (
    <div className={cn("wide-prow", selected && "is-on")}>
      <button
        type="button"
        className="wide-prow-hit"
        aria-label={`Spotlight piece ${index + 1}, ${pieceName}`}
        onClick={onToggle}
      >
        <span className="wide-pn">{index + 1}</span>
        <span
          className="wide-pth"
          style={{
            backgroundImage: lookSrc ? `url(${lookSrc})` : undefined,
            backgroundPosition: `${tag.x}% ${tag.y}%`,
          }}
        />
        <span className="wide-ptx">
          <span className="wide-pnm">{stylePin ? stylePin.styleName : pieceName}</span>
          <span className="wide-prt">
            {stylePin ? stylePin.houseName : target ? retailerLabel(tag) : "No close match yet"}
          </span>
        </span>
      </button>
      <div className="wide-prow-acts">
        {target ? (
          <button
            type="button"
            className="wide-btn wide-btn-primary"
            aria-label={`Shop ${pieceName}`}
            onClick={onShop}
          >
            Shop
          </button>
        ) : null}
        {stylePin ? <StyleViewLink pin={stylePin} /> : null}
      </div>
    </div>
  );
}
