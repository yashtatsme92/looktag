import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Radio, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { LookCanvas } from "@/components/looks/look-canvas";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ECHO_FROM_KEY, echoKicker, echoLane, pieceLine } from "@/lib/home/echo";
import { markEditOpenedFromLook } from "@/lib/nav/back";
import { listFashionLabels } from "@/lib/labels/api";
import { looksBelongToHouse, type FashionLabel } from "@/lib/labels/model";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { visualShopTarget } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import { useSavedLooks } from "@/lib/looks/saved";
import { shareOrCopy } from "@/lib/looks/share";
import { useLooksStore } from "@/lib/looks/store";
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
  const looks = useLooksStore((s) => s.looks);
  const { user, isPending } = useCurrentUserState();
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const saved = useSavedLooks((s) => s.ids.includes(look.id));
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
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

  const house = labels.find((label) => looksBelongToHouse(look, label));
  const echo = useMemo(() => echoLane(look, looks.length > 0 ? looks : [look]).slice(0, 4), [look, looks]);

  function openShop(tag: ProductTag, source: "piece_shop" | "shop_look") {
    const target = visualShopTarget(tag);
    if (!target?.url) return false;
    const win = window.open(target.url, "_blank", "noopener,noreferrer");
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

  function shopWhole() {
    const rows = look.tags.filter((tag) => visualShopTarget(tag)?.url);
    if (rows.length === 0) {
      toast.message("No close match yet");
      return;
    }
    let opened = 0;
    for (const tag of rows) {
      if (openShop(tag, "shop_look")) opened += 1;
    }
    if (opened === 0) toast.message("Allow pop-ups to open the shops");
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
        <div className="wide-split">
          <div className="wide-plate">
            <LookCanvas
              imageSrc={look.imageSrc}
              title={look.title}
              tags={look.tags}
              selectedId={selectedId}
              onSelect={setSelectedId}
              fit="cover"
              className="wide-plate-canvas"
            />
          </div>
          <aside className="wide-panel" aria-label="Shop">
            <div className="wide-panel-hd">
              <p className="wide-kicker">
                {house ? (
                  <Link to="/houses/$labelId" params={{ labelId: house.id }} className="wide-kicker-link">
                    {house.name}
                  </Link>
                ) : null}
                {house && look.creator ? " · " : null}
                {look.creator || (!house ? echoKicker(look) : null)}
              </p>
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
              {look.tags.map((tag, index) => {
                const target = visualShopTarget(tag);
                const selected = tag.id === selectedId;
                return (
                  <div key={tag.id} className={cn("wide-prow", selected && "is-on")}>
                    <button
                      type="button"
                      className="wide-prow-hit"
                      aria-label={`Spotlight piece ${index + 1}, ${tag.name || "Piece"}`}
                      onClick={() => setSelectedId(selected ? null : tag.id)}
                    >
                      <span className="wide-pn">{index + 1}</span>
                      <span
                        className="wide-pth"
                        style={{
                          backgroundImage: look.imageSrc ? `url(${look.imageSrc})` : undefined,
                          backgroundPosition: `${tag.x}% ${tag.y}%`,
                        }}
                      />
                      <span className="wide-ptx">
                        <span className="wide-pnm">{tag.name || "Piece"}</span>
                        <span className="wide-prt">{target ? retailerLabel(tag) : "No close match yet"}</span>
                      </span>
                    </button>
                    {target ? (
                      <button type="button" className="wide-btn wide-btn-primary" onClick={() => shopPiece(tag)}>
                        Shop
                      </button>
                    ) : null}
                  </div>
                );
              })}
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
        title="Sign in to save"
        next={`/looks/${look.id}`}
        description="Save stays on this look. Cancel returns here."
        primary="Continue with email"
        secondary="Cancel"
      />
    </div>
  );
}
