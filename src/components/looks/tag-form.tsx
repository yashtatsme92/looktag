import { useState } from "react";
import { ChevronDown, ExternalLink, Search, Trash2 } from "lucide-react";
import { Field } from "@/components/ds";
import { PieceThumb } from "@/components/looks/piece-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, parsePrice } from "@/lib/looks/format";
import { cheapestOffer, removeOffer, sortedOffers, wornLink } from "@/lib/looks/offers";
import { detectRetailer, retailerLabel } from "@/lib/looks/retailers";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type TagFormProps = {
  tag: ProductTag;
  index: number;
  compact?: boolean;
  lookSrc?: string;
  onChange: (tag: ProductTag) => void;
  onRemove: () => void;
  onSearch: () => void;
  searching?: boolean;
};

export function TagForm({ tag, index, compact, lookSrc, onChange, onRemove, onSearch, searching }: TagFormProps) {
  const [manualOpen, setManualOpen] = useState(Boolean(tag.wornUrl));
  const offers = sortedOffers(tag);
  const cheap = cheapestOffer(tag);
  const worn = wornLink(tag);

  function patch(partial: Partial<ProductTag>) {
    onChange({ ...tag, ...partial });
  }

  return (
    <div className="flex flex-col gap-3">
      {compact ? (
        <div className="flex items-center gap-2">
          <Input
            id={`name-${tag.id}`}
            value={tag.name}
            autoComplete="off"
            placeholder="Navy wool coat"
            className="flex-1"
            aria-label="Name"
            onChange={(event) => patch({ name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="size-11 shrink-0 text-destructive"
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Remove</span>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="ds-display text-title">Pin {index + 1}</p>
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-destructive">
              <Trash2 className="size-4" />
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor={`name-${tag.id}`}>
              <Input
                id={`name-${tag.id}`}
                value={tag.name}
                autoComplete="off"
                autoFocus={!tag.name}
                placeholder="Navy wool coat"
                onChange={(event) => patch({ name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSearch();
                  }
                }}
              />
            </Field>
            <Field label="Brand" htmlFor={`brand-${tag.id}`}>
              <Input
                id={`brand-${tag.id}`}
                value={tag.brand}
                autoComplete="off"
                placeholder="Optional"
                onChange={(event) => patch({ brand: event.target.value })}
              />
            </Field>
          </div>
        </>
      )}

      <Button type="button" onClick={onSearch} disabled={searching}>
        <Search className="size-4" />
        {searching ? "Searching shops…" : offers.length > 0 ? "Search again" : tag.name.trim() ? "Search item" : "Find this piece"}
      </Button>
      {compact ? null : (
        <p className="text-caption leading-relaxed text-muted-foreground">
          Search reads the pin on the photo. Live item pages come from Catalog shops.
        </p>
      )}

      {searching ? (
        <p className="text-sm text-muted-foreground">Comparing Zalando, COS, Zara and more…</p>
      ) : null}

      {offers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="ds-kicker">Live prices</p>
          <ul className="flex flex-col gap-1.5">
            {offers.map((offer) => {
              const isCheapest = Boolean(
                cheap &&
                  offer.id === cheap.id &&
                  offers.length > 1 &&
                  parsePrice(cheap.price) > 0,
              );
              return (
                <li key={offer.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2",
                      isCheapest ? "border-foreground/80" : "border-border",
                    )}
                  >
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                    >
                      <PieceThumb lookSrc={lookSrc} productSrc={offer.imageUrl} x={tag.x} y={tag.y} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{retailerLabel(offer)}</span>
                      {isCheapest ? (
                        <Badge variant="muted" className="uppercase">
                          Cheapest
                        </Badge>
                      ) : null}
                      <span className="shrink-0 tabular-nums">
                        {offer.price.trim() ? formatMoney(offer.price, offer.currency) : "See shop"}
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2 text-destructive"
                      onClick={() => onChange(removeOffer(tag, offer.id))}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Remove listing</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : compact ? null : (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          No live listings yet. Search, or paste the page you wore below.
        </p>
      )}

      {compact && !manualOpen && !tag.wornUrl ? (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="h-11 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          Paste a product page
        </button>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setManualOpen((open) => !open)}
            className="flex h-11 w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
          >
            Paste a product page
            <ChevronDown className={cn("size-4 transition-transform", manualOpen && "rotate-180")} />
          </button>
          {manualOpen ? (
            <Field
              label="As worn"
              htmlFor={`worn-${tag.id}`}
              hint="The item you wore. Shoppers can still open it — cheapest always comes from Search."
            >
              <Input
                id={`worn-${tag.id}`}
                value={tag.wornUrl ?? ""}
                type="url"
                placeholder="https://www.zalando.de/item-sku.html"
                onChange={(event) => {
                  const url = event.target.value;
                  const detected = detectRetailer(url);
                  patch({
                    wornUrl: url,
                    wornRetailerId: detected?.id ?? tag.wornRetailerId,
                  });
                }}
              />
              {worn?.url && cheap?.url && worn.url !== cheap.url ? (
                <p className="text-caption text-muted-foreground">
                  As worn: {retailerLabel({ retailerId: worn.retailerId, url: worn.url })}
                </p>
              ) : null}
            </Field>
          ) : null}
        </div>
      )}
    </div>
  );
}
