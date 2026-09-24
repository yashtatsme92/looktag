import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ProductList } from "@/components/looks/product-list";
import { ShopDock } from "@/components/looks/shop-dock";
import { formatMoney, lookCurrency, lookTotal } from "@/lib/looks/format";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { shopTarget } from "@/lib/looks/offers";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { useWideLayout } from "@/lib/pwa/use-wide-layout";
import type { ProductTag } from "@/lib/looks/types";
import "../../styles.look-dock.css";

type LookShopPanelProps = {
  tags: ProductTag[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  lookSrc?: string;
  /** Phone shop sheet — controlled from look route (pin tap opens; dismiss keeps pin). */
  sheetOpen?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
  lookId?: string;
  userState?: FunnelUserState;
};

function shopLookCheapest(tags: ProductTag[], context?: { lookId?: string; userState?: FunnelUserState }) {
  const urls = tags
    .map((tag) => {
      const target = shopTarget(tag);
      return target?.url
        ? { retailerId: target.retailerId, tagId: tag.id, url: target.url }
        : null;
    })
    .filter((row): row is { retailerId: string; tagId: string; url: string } => Boolean(row));
  const unique = urls.filter((row, index, items) => items.findIndex((item) => item.url === row.url) === index);
  const targets = unique.map((row) => row.url);
  if (targets.length === 0) {
    toast.message("No live shops on this look yet");
    return;
  }
  const chrome = chromeLayout();
  for (const row of unique) {
    recordOutboundShopClick({
      chrome,
      lookId: context?.lookId,
      retailerId: row.retailerId,
      source: "shop_look",
      tagId: row.tagId,
      urlHost: hostFromUrl(row.url),
      userState: context?.userState,
    });
  }
  let opened = 0;
  for (const url of targets) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) opened += 1;
  }
  if (opened === 0) {
    toast.message("Allow pop-ups to open each cheapest page");
    return;
  }
  if (opened < urls.length) {
    toast.message(`Opened ${opened} of ${urls.length} cheapest pages`, {
      description: "Allow pop-ups to open the rest.",
    });
    return;
  }
  toast.success(
    urls.length === 1 ? "Opened cheapest page" : `Opened ${urls.length} cheapest pages`,
  );
}

/** Look detail shop column: sticky ShopDock + look-level strip + one expanded piece. */
export function LookShopPanel({
  tags,
  selectedId,
  onSelect,
  lookSrc,
  sheetOpen,
  onSheetOpenChange,
  lookId,
  userState,
}: LookShopPanelProps) {
  const wide = useWideLayout();
  const outfitTotal = lookTotal(tags);
  const outfitCurrency = lookCurrency(tags);
  const shopableCount = tags.filter((tag) => shopTarget(tag)?.url).length;
  const shopLook = () => shopLookCheapest(tags, { lookId, userState });

  return (
    <>
      <ShopDock
        tags={tags}
        selectedId={selectedId}
        onSelect={onSelect}
        lookSrc={lookSrc}
        lookId={lookId}
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
        sheet={wide ? "pieces" : "look"}
        onShopLook={shopLook}
        userState={userState}
      />

      {/* Desktop / tablet website: sticky column strip + pieces (board-02 left/right). */}
      {wide && tags.length > 0 ? (
        <section className="mt-6">
          <div className="look-shop-strip mb-3">
            <button
              type="button"
              onClick={shopLook}
              className="look-shop-strip-primary"
              disabled={shopableCount === 0}
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
            {outfitTotal > 0 ? (
              <p className="look-shop-strip-meta">
                From {formatMoney(String(outfitTotal), outfitCurrency)} · {shopableCount}{" "}
                {shopableCount === 1 ? "shop" : "shops"}
              </p>
            ) : null}
          </div>
          <h2 className="ds-section-title mb-3">Pieces</h2>
          <ProductList
            tags={tags}
            selectedId={selectedId}
            onSelect={onSelect}
            shoppable
            lookId={lookId}
            primaryInDock
            lookSrc={lookSrc}
            userState={userState}
          />
        </section>
      ) : null}

      {/* Phone: quiet affordance under photo when sheet is closed (pin tap still primary). */}
      {!wide && tags.length > 0 ? (
        <div className="mt-4 px-1">
          <button
            type="button"
            className="look-shop-phone-open"
            onClick={() => onSheetOpenChange?.(true)}
            aria-label="Open shop sheet"
          >
            {tags.length} {tags.length === 1 ? "piece" : "pieces"} · Shop look
          </button>
        </div>
      ) : null}
    </>
  );
}
