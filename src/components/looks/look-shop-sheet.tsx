import { useEffect, useRef, type KeyboardEvent } from "react";
import { ExternalLink, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useStylePin } from "@/components/labels/style-pin-note";
import { visualShopTarget } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import type { ProductTag } from "@/lib/looks/types";

type LookShopSheetProps = {
  tags: ProductTag[];
  open: boolean;
  onClose: () => void;
  onShopPiece: (tag: ProductTag) => void;
  onShopWhole: () => void;
};

/**
 * `Shop this look` (Look/3): a sheet that slides up inside the look plate, so it always sits above the 4-tab bar.
 * One Shop per piece, never a price. A Style-linked piece shows its Style name and House with a ghost View Style.
 */
export function LookShopSheet({ tags, open, onClose, onShopPiece, onShopWhole }: LookShopSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) sheetRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  }

  return (
    <>
      <div className="look-sheet-scrim" aria-hidden onClick={onClose} />
      <div
        ref={sheetRef}
        className="look-sheet"
        role="dialog"
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
          {tags.map((tag, index) => (
            <SheetRow key={tag.id} tag={tag} index={index} onShop={() => onShopPiece(tag)} />
          ))}
        </ul>
        <button type="button" className="look-sheet-whole" onClick={onShopWhole}>
          Shop whole look
          <ExternalLink className="size-4" />
        </button>
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
