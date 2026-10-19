import { useEffect, useRef, type KeyboardEvent } from "react";
import { ExternalLink, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useStylePin } from "@/components/labels/style-pin-note";
import { SkeletonOfferRow } from "@/components/ds/skeleton";
import { useDelayedLoad } from "@/lib/loading/delayed-load";
import { settleLoad } from "@/lib/loading/test-delay";
import { visualShopTarget } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import type { ProductTag } from "@/lib/looks/types";

type LookShopSheetProps = {
  tags: ProductTag[];
  open: boolean;
  onClose: () => void;
  onShopPiece: (tag: ProductTag) => void;
  /** The sheet is the whole-look shop; a footer action is only offered where a surface asks for one. */
  onShopWhole?: () => void;
  phoneWholeLook?: boolean;
};

/**
 * `Shop this look` (Look/3): a sheet that slides up inside the look plate, so it always sits above the 4-tab bar.
 * One Shop per piece, never a price. A Style-linked piece shows its Style name and House with a ghost View Style.
 */
export function LookShopSheet({ tags, open, onClose, onShopPiece, onShopWhole, phoneWholeLook = false }: LookShopSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const offers = useDelayedLoad(
    () => (open ? settleLoad(tagsRef.current) : new Promise<ProductTag[]>(() => {})),
    { cacheKey: open ? `shop-sheet:${tags.map((tag) => tag.id).join(",")}` : "shop-sheet:closed" },
  );

  /** Focus moves into the sheet on open and returns to the control that opened it on close. */
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const plate = sheetRef.current?.closest(".look-plate") ?? null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        // The opener can be swapped out while the sheet is open (Shop <-> Shop whole look); fall back to the plate's Shop control.
        const target = opener?.isConnected ? opener : plate?.querySelector<HTMLElement>(".look-plate-shop, .look-plate-shop-whole");
        target?.focus({ preventScroll: true });
      });
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    // Focus trap: Tab and Shift+Tab cycle inside the sheet, never out to the pins and card behind the scrim.
    const sheet = sheetRef.current;
    if (!sheet) return;
    const items = [...sheet.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className="look-sheet-scrim" aria-hidden onClick={onClose} />
      <div
        ref={sheetRef}
        className="look-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Shop this look"
        tabIndex={-1}
        data-guest-shop="ok"
        onKeyDown={onKeyDown}
      >
        <span className="look-sheet-grab" aria-hidden />
        <button type="button" className="look-sheet-x" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </button>
        <h2 className="look-sheet-title">Shop this look</h2>
        <p className="look-sheet-sub">
          No account needed. One Shop per piece, straight to the live page.
        </p>
        <ul className="look-sheet-list">
          {offers.phase === "error" ? (
            <li className="look-sheet-row">
              <span className="look-sheet-meta">No close match yet</span>
            </li>
          ) : offers.phase === "skeleton" ? (
            tags.map((tag) => (
              <li key={tag.id}>
                <SkeletonOfferRow />
              </li>
            ))
          ) : (
            tags.map((tag, index) => (
              <SheetRow key={tag.id} tag={tag} index={index} onShop={() => onShopPiece(tag)} />
            ))
          )}
        </ul>
        {onShopWhole ? (
          <button
            type="button"
            className={`look-sheet-whole${phoneWholeLook ? " look-sheet-whole-phone" : ""}`}
            onClick={onShopWhole}
          >
            {phoneWholeLook ? (
              <>Shop whole look · {tags.length} {tags.length === 1 ? "piece" : "pieces"}</>
            ) : (
              <>
                Shop whole look
                <ExternalLink className="size-4" />
              </>
            )}
          </button>
        ) : null}
        <p className="look-sheet-count">
          {tags.length} {tags.length === 1 ? "piece" : "pieces"} total
        </p>
      </div>
    </>
  );
}

function SheetRow({ tag, index, onShop }: { tag: ProductTag; index: number; onShop: () => void }) {
  const stylePin = useStylePin(tag.styleId);
  const target = visualShopTarget(tag);
  const pieceName = tag.name.trim() || "Piece";
  const retailer = target ? retailerLabel({ retailerId: target.retailerId, url: target.url }) : "";
  const title = stylePin ? stylePin.styleName : pieceName;
  const sub = stylePin ? stylePin.houseName : target ? retailer : "No close match yet";
  const shop = target ? (
    <button type="button" className="look-sheet-shop" aria-label={`Shop ${pieceName}`} onClick={onShop}>
      Shop
      <ExternalLink className="size-3.5" />
    </button>
  ) : null;
  return (
    <li className="look-sheet-row" data-style={stylePin ? "true" : undefined}>
      <span className="look-sheet-num">{index + 1}</span>
      <span className="look-sheet-text">
        <span className="look-sheet-name">{title}</span>
        <span className="look-sheet-meta">{sub}</span>
      </span>
      {stylePin ? (
        <span className="look-sheet-acts">
          {shop}
          <Link
            to="/houses/$labelId/$collectionId/$styleId"
            params={{ labelId: stylePin.labelId, collectionId: stylePin.lineSlug, styleId: stylePin.styleId }}
            className="look-sheet-view"
          >
            View Style
          </Link>
        </span>
      ) : (
        shop
      )}
    </li>
  );
}
