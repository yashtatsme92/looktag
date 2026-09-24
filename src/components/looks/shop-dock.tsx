import { useState } from "react";
import { ChevronUp, ExternalLink } from "lucide-react";
import { ProductList } from "@/components/looks/product-list";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatMoney, lookCurrency, lookTotal } from "@/lib/looks/format";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { shopTarget, tagOffers } from "@/lib/looks/offers";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";
import "../../styles.look-dock.css";

type ShopDockProps = {
  tags: ProductTag[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  floating?: boolean;
  lookSrc?: string;
  /** Controlled sheet open (look detail pin → sheet). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  lookId?: string;
  /**
   * Sheet body:
   * - `pieces` — feed / legacy drawer (piece list only)
   * - `look` — board-02 phone shop sheet (piece Shop + look strip + Compare)
   */
  sheet?: "pieces" | "look";
  /** Look-level cheapest opener from LookShopPanel. */
  onShopLook?: () => void;
  userState?: FunnelUserState;
};

export function ShopDock({
  tags,
  selectedId,
  onSelect,
  floating = false,
  lookSrc,
  lookId,
  open: openProp,
  onOpenChange,
  sheet = "pieces",
  onShopLook,
  userState,
}: ShopDockProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = typeof openProp === "boolean";
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const total = lookTotal(tags);
  const currency = lookCurrency(tags);
  const selected = tags.find((tag) => tag.id === selectedId) ?? tags[0] ?? null;
  const selectedIndex = selected ? tags.findIndex((tag) => tag.id === selected.id) : 0;
  const target = selected ? shopTarget(selected) : null;
  const pieceName = selected?.name.trim() || "Shop the look";
  const offerCount = selected ? tagOffers(selected).filter((offer) => offer.url).length : 0;
  const shopableCount = tags.filter((tag) => shopTarget(tag)?.url).length;
  const lookSheet = sheet === "look";

  if (tags.length === 0) {
    if (floating) return null;
    return (
      <aside className="mt-4 flex flex-col gap-3 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-2xl">Shop the look</h2>
        <p className="text-sm text-muted-foreground">No pieces tagged on this look yet.</p>
      </aside>
    );
  }

  return (
    <>
      <div
        className={cn(
          "shop-dock z-20 px-3",
          floating
            ? "shop-dock-float absolute inset-x-0 bottom-0 pb-2 pt-3"
            : "sticky bottom-0 -mx-4 mt-4 bg-gradient-to-t from-background from-70% to-transparent pt-6 pb-1",
        )}
        data-guest-shop="ok"
      >
        <div className="shop-dock-card">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left"
            aria-label={
              selected
                ? `Piece ${selectedIndex + 1}, ${pieceName}. Open shop sheet.`
                : "Open shop sheet"
            }
          >
            {selected ? <span className="shop-dock-index">{selectedIndex + 1}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="shop-dock-name [overflow-wrap:anywhere] whitespace-normal">{pieceName}</span>
            </span>
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          </button>
          {target?.url ? (
            <Button asChild size="sm" className="min-h-11 shrink-0 px-4">
              <a
                href={target.url}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
             recordOutboundShopClick({
               cheapest: Boolean(target.cheapest),
               chrome: chromeLayout(),
               lookId,
               offerCount,
               retailerId: target.retailerId,
               source: "piece_shop",
               tagId: selected?.id,
               urlHost: hostFromUrl(target.url),
               userState,
             })
                }
              >
                Shop
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0"
              onClick={() => setOpen(true)}
            >
              Pieces
            </Button>
          )}
        </div>
      </div>

      <Drawer
        open={open}
        onOpenChange={(next) => {
          // Dismiss keeps pin selection — only closes the sheet.
          setOpen(next);
        }}
      >
        <DrawerContent className={cn(lookSheet && "shop-look-sheet")}>
          <DrawerHeader>
            <DrawerTitle>Shop the look</DrawerTitle>
            <DrawerDescription>
              {lookSheet
                ? total > 0
                  ? `Guest Shop OK — one Shop per piece in the bar. From ${formatMoney(String(total), currency)} · ${shopableCount} ${shopableCount === 1 ? "shop" : "shops"}.`
                  : "Guest Shop OK — tap Shop for the live item page. No account needed."
                : total > 0
                  ? `Tap a pin or a row — then Shop in the bar for the cheapest live page. ${formatMoney(String(total), currency)} if you buy every piece.`
                  : "Tap a pin or a row, then Shop in the bar for the live item page."}
            </DrawerDescription>
          </DrawerHeader>

          {lookSheet ? (
            <div className="shop-look-sheet-body overflow-y-auto px-5 pb-2">
              <div className="shop-dock-card mb-3" data-guest-shop="ok">
                {selected ? <span className="shop-dock-index">{selectedIndex + 1}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="shop-dock-name [overflow-wrap:anywhere] whitespace-normal">
                    {pieceName}
                  </span>
                </span>
                {target?.url ? (
                  <Button asChild size="sm" className="min-h-11 shrink-0 px-4">
                    <a
                      href={target.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        recordOutboundShopClick({
                          cheapest: Boolean(target.cheapest),
                          chrome: chromeLayout(),
                          lookId,
                          offerCount,
                          retailerId: target.retailerId,
                          source: "piece_shop",
                          tagId: selected?.id,
                          urlHost: hostFromUrl(target.url),
                          userState,
                        })
                      }
                    >
                      Shop
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
              </div>

              <div className="look-shop-strip mb-3">
                <button
                  type="button"
                  onClick={() => onShopLook?.()}
                  className="look-shop-strip-primary"
                  disabled={shopableCount === 0 || !onShopLook}
                  data-guest-shop="ok"
                >
                  <span className="min-w-0 flex-1 text-left leading-snug [overflow-wrap:anywhere]">
                    Shop look · cheapest per piece
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 opacity-70" />
                </button>
                <button
                  type="button"
                  className="look-shop-strip-secondary"
                  disabled
                  title="Compare outfit — coming soon"
                >
                  Compare outfit (later)
                </button>
                {total > 0 ? (
                  <p className="look-shop-strip-meta">
                    From {formatMoney(String(total), currency)} · {shopableCount}{" "}
                    {shopableCount === 1 ? "shop" : "shops"}
                  </p>
                ) : null}
              </div>

              <h2 className="ds-section-title mb-3">Pieces</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Expanded card = Compare / retailers only — Shop stays in the bar.
              </p>
              <ProductList
                tags={tags}
                selectedId={selectedId}
                onSelect={(id) => {
                  onSelect(id);
                  // Keep sheet open when switching pieces (board-02).
                }}
                shoppable
                lookId={lookId}
                primaryInDock
                lookSrc={lookSrc}
                userState={userState}
              />
            </div>
          ) : (
            <div className="overflow-y-auto px-5 pb-5">
              <ProductList
                tags={tags}
                selectedId={selectedId}
                onSelect={(id) => {
                  onSelect(id);
                  setOpen(false);
                }}
                shoppable
                lookId={lookId}
                primaryInDock
                lookSrc={lookSrc}
                userState={userState}
              />
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
