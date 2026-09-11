import { ShopOffers, priceLabel } from "@/components/looks/shop-offers";
import { PieceThumb } from "@/components/looks/piece-thumb";
import { shopTarget, cheapestOffer, tagOffers } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type ProductListProps = {
  tags: ProductTag[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  shoppable?: boolean;
  /** When true, sticky dock owns the primary Shop CTA — expanded card shows Compare only. */
  primaryInDock?: boolean;
  lookSrc?: string;
};

export function ProductList({
  tags,
  selectedId,
  onSelect,
  shoppable,
  primaryInDock,
  lookSrc,
}: ProductListProps) {
  if (tags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pieces tagged yet. Tap the photo, then search.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tags.map((tag) => {
        const selected = tag.id === selectedId;
        const target = shopTarget(tag);
        const shops = tagOffers(tag).filter((offer) => offer.url);
        const labels = [
          ...new Set(
            [tag.brand, ...(shops.length ? shops.map((offer) => retailerLabel(offer)) : [retailerLabel(tag)])].filter(
              Boolean,
            ),
          ),
        ];
        const cheap = cheapestOffer(tag);
        const price = priceLabel(tag);
        return (
          <li key={tag.id}>
            <div
              className={cn(
                "w-full rounded-xl border bg-card text-left transition-[border-color,box-shadow] duration-150",
                selected
                  ? "border-foreground shadow-[var(--shadow-border)]"
                  : "border-border",
                selected ? "p-3" : "px-3 py-2",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect?.(tag.id)}
                className={cn(
                  "flex w-full items-center gap-3 text-left",
                  selected ? "items-start" : "min-h-11",
                )}
              >
                <PieceThumb
                  lookSrc={lookSrc}
                  x={tag.x}
                  y={tag.y}
                  productSrc={cheap?.imageUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block font-medium leading-snug [overflow-wrap:anywhere]",
                      !selected && "line-clamp-2",
                    )}
                  >
                    {tag.name || "Untitled piece"}
                  </span>
                  {selected ? (
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                      {labels.join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {price.from ? <span className="text-muted-foreground">from </span> : null}
                  {price.text}
                </span>
              </button>
              {shoppable && selected && target?.url ? (
                <ShopOffers tag={tag} mode={primaryInDock ? "compare" : "shop"} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
