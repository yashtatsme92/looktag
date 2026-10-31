import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { hostFromUrl, recordOutboundShopClick, type FunnelUserState } from "@/lib/looks/funnel";
import { shopTarget, sortOffers, tagOffers, wornLink, type OfferSortMode } from "@/lib/looks/offers";
import { chromeLayout } from "@/lib/pwa/use-wide-layout";
import { retailerLabel } from "@/lib/looks/retailers";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type ShopOffersProps = {
  tag: ProductTag;
  lookId?: string;
  /** `shop` = primary Shop CTA + optional Compare. `compare` = retailer list only (dock owns Shop). */
  mode?: "shop" | "compare";
  userState?: FunnelUserState;
};

export function ShopOffers({ tag, lookId, mode = "shop", userState }: ShopOffersProps) {
  const [sortMode, setSortMode] = useState<OfferSortMode>("default");
  const offers = sortOffers(tagOffers(tag), sortMode, tag.wornUrl).filter((offer) => offer.url);
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
          onClick={() =>
            recordOutboundShopClick({
              chrome: chromeLayout(),
              lookId,
              offerCount: offers.length,
              retailerId: target.retailerId,
              sortMode,
              source: "piece_shop",
              tagId: tag.id,
              urlHost: hostFromUrl(target.url),
              userState,
            })
          }
        >
          Shop {retailerLabel({ retailerId: target.retailerId, url: target.url })}
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
              {multi ? (
                <li>
                  <label className="flex h-11 items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Sort</span>
                    <select
                      aria-label="Sort"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as OfferSortMode)}
                      className="h-11 min-w-0 rounded-md border border-border bg-transparent px-2 text-foreground"
                    >
                      <option value="default">Featured</option>
                      <option value="price-asc">Price ↑</option>
                      <option value="price-desc">Price ↓</option>
                    </select>
                  </label>
                </li>
              ) : null}
              {offers.map((offer) => {
                return (
                  <li key={offer.id}>
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-11 items-center gap-3 rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted/60"
                      onClick={() =>
                        recordOutboundShopClick({
                          chrome: chromeLayout(),
                          lookId,
                          offerCount: offers.length,
                          retailerId: offer.retailerId,
                          sortMode,
                          source: "compare_offer",
                          tagId: tag.id,
                          urlHost: hostFromUrl(offer.url),
                          userState,
                        })
                      }
                    >
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{retailerLabel(offer)}</span>
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
