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
  lookSrc?: string;
};

export function ProductList({ tags, selectedId, onSelect, shoppable, lookSrc }: ProductListProps) {
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
                "w-full rounded-lg border bg-card p-3 text-left transition-[border-color,box-shadow] duration-150",
                selected ? "border-foreground shadow-[var(--shadow-border)]" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect?.(tag.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <PieceThumb
                  lookSrc={lookSrc}
                  x={tag.x}
                  y={tag.y}
                  productSrc={cheap?.imageUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{tag.name || "Untitled piece"}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {labels.join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {price.from ? <span className="text-muted-foreground">from </span> : null}
                  {price.text}
                </span>
              </button>
              {shoppable && target?.url ? <ShopOffers tag={tag} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
