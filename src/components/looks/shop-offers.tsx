import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/looks/format";
import { cheapestOffer, shopTarget, sortedOffers, tagOffers, wornLink } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type ShopOffersProps = {
  tag: ProductTag;
  /** `shop` = primary Shop CTA + optional Compare. `compare` = retailer list only (dock owns Shop). */
  mode?: "shop" | "compare";
};

export function priceLabel(tag: ProductTag): { text: string; from: boolean } {
  const cheap = cheapestOffer(tag);
  const count = tagOffers(tag).filter((offer) => offer.url).length;
  if (!cheap?.price) return { text: "—", from: false };
  return {
    text: formatMoney(cheap.price, cheap.currency ?? tag.currency),
    from: count > 1,
  };
}

export function ShopOffers({ tag, mode = "shop" }: ShopOffersProps) {
  const offers = sortedOffers(tag).filter((offer) => offer.url);
  const cheap = cheapestOffer(tag);
  const target = shopTarget(tag);
  const worn = wornLink(tag);
  const compareOnly = mode === "compare";
  const multi = offers.length > 1;
  const wornExtra = Boolean(worn?.url && !offers.some((offer) => offer.url === worn.url));
  const hasCompare = multi || wornExtra;
  const [open, setOpen] = useState(compareOnly && hasCompare);
  if (!target?.url) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {!compareOnly ? (
        <a
          href={target.url}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Shop {retailerLabel({ retailerId: target.retailerId, url: target.url })}
          {target.cheapest ? <span className="font-normal opacity-80"> · cheapest</span> : null}
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      {hasCompare ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 text-sm",
              compareOnly
                ? "rounded-md border border-border bg-card font-medium text-foreground hover:bg-muted/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {multi ? `Compare ${offers.length} shops` : "As worn"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open ? (
            <ul className="flex flex-col gap-1.5">
              {offers.map((offer) => {
                const cheapest = Boolean(cheap && offer.id === cheap.id && multi);
                return (
                  <li key={offer.id}>
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-md border px-3 text-sm transition-colors hover:bg-muted/60",
                        cheapest ? "border-foreground/80" : "border-border",
                      )}
                    >
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{retailerLabel(offer)}</span>
                      {cheapest ? (
                        <Badge variant="muted" className="uppercase">
                          Cheapest
                        </Badge>
                      ) : null}
                      <span className="tabular-nums">{formatMoney(offer.price, offer.currency)}</span>
                    </a>
                  </li>
                );
              })}
              {wornExtra && worn ? (
                <li>
                  <a
                    href={worn.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 items-center gap-3 rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      As worn · {retailerLabel({ retailerId: worn.retailerId, url: worn.url })}
                    </span>
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : compareOnly ? (
        <p className="text-sm text-muted-foreground">One live shop for this piece — use Shop in the bar.</p>
      ) : null}
    </div>
  );
}
