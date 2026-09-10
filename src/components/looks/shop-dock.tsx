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
import { shopTarget } from "@/lib/looks/offers";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";
import "../../styles.look-dock.css";

type ShopDockProps = {
  tags: ProductTag[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  floating?: boolean;
  lookSrc?: string;
};

export function ShopDock({ tags, selectedId, onSelect, floating = false, lookSrc }: ShopDockProps) {
  const [open, setOpen] = useState(false);
  const total = lookTotal(tags);
  const currency = lookCurrency(tags);
  const selected = tags.find((tag) => tag.id === selectedId) ?? tags[0] ?? null;
  const selectedIndex = selected ? tags.findIndex((tag) => tag.id === selected.id) : 0;
  const target = selected ? shopTarget(selected) : null;
  const pieceName = selected?.name.trim() || "Shop the look";

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
      >
        <div className="shop-dock-card">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left"
            aria-label={selected ? `Piece ${selectedIndex + 1}, ${pieceName}. Open pieces.` : "Open pieces"}
          >
            {selected ? <span className="shop-dock-index">{selectedIndex + 1}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="shop-dock-name [overflow-wrap:anywhere] whitespace-normal">{pieceName}</span>
            </span>
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          </button>
          {target?.url ? (
            <Button asChild size="sm" className="min-h-11 shrink-0 px-4">
              <a href={target.url} target="_blank" rel="noreferrer">
                Shop
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" className="min-h-11 shrink-0" onClick={() => setOpen(true)}>
              Pieces
            </Button>
          )}
        </div>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Shop the look</DrawerTitle>
            <DrawerDescription>
              {total > 0
                ? `Tap a pin or a row — then Shop in the bar for the cheapest live page. ${formatMoney(String(total), currency)} if you buy every piece.`
                : "Tap a pin or a row, then Shop in the bar for the live item page."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-5 pb-5">
            <ProductList
              tags={tags}
              selectedId={selectedId}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
              shoppable
              primaryInDock
              lookSrc={lookSrc}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
