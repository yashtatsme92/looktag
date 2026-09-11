import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ProductList } from "@/components/looks/product-list";
import { ShopDock } from "@/components/looks/shop-dock";
import { formatMoney, lookCurrency, lookTotal } from "@/lib/looks/format";
import { shopTarget } from "@/lib/looks/offers";
import type { ProductTag } from "@/lib/looks/types";
import "../../styles.look-dock.css";

type LookShopPanelProps = {
  tags: ProductTag[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  lookSrc?: string;
};

function shopLookCheapest(tags: ProductTag[]) {
  const urls = tags
    .map((tag) => shopTarget(tag)?.url)
    .filter((url): url is string => Boolean(url));
  if (urls.length === 0) {
    toast.message("No live shops on this look yet");
    return;
  }
  let opened = 0;
  for (const url of urls) {
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
export function LookShopPanel({ tags, selectedId, onSelect, lookSrc }: LookShopPanelProps) {
  const outfitTotal = lookTotal(tags);
  const outfitCurrency = lookCurrency(tags);
  const shopableCount = tags.filter((tag) => shopTarget(tag)?.url).length;

  return (
    <>
      <ShopDock tags={tags} selectedId={selectedId} onSelect={onSelect} lookSrc={lookSrc} />

      {tags.length > 0 ? (
        <section className="mt-6">
          <div className="look-shop-strip mb-3">
            <button
              type="button"
              onClick={() => shopLookCheapest(tags)}
              className="look-shop-strip-primary"
              disabled={shopableCount === 0}
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
              Compare outfit
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
            primaryInDock
            lookSrc={lookSrc}
          />
        </section>
      ) : null}
    </>
  );
}
