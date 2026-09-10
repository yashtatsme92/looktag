import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PieceThumb } from "@/components/looks/piece-thumb";
import type { SuggestedPiece } from "@/lib/ai/suggest";
import { formatMoney } from "@/lib/looks/format";
import { retailerLabel } from "@/lib/looks/retailers";
import { cn } from "@/lib/utils";

type SuggestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: SuggestedPiece[];
  lookSrc?: string;
  onAccept: (pieces: SuggestedPiece[]) => void;
};

export function SuggestDialog({ open, onOpenChange, pieces, lookSrc, onAccept }: SuggestDialogProps) {
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  const selected = pieces.filter((_, index) => picked[index] !== false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked({});
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(36rem,calc(100dvh-2rem))] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>From this photo</DialogTitle>
          <DialogDescription>Untick anything you do not want pinned.</DialogDescription>
        </DialogHeader>
        {pieces.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to pin yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pieces.map((piece, index) => {
              const on = picked[index] !== false;
              const cheap = piece.offers[0];
              return (
                <li key={`${piece.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => setPicked((current) => ({ ...current, [index]: !on }))}
                    className={cn(
                      "flex w-full gap-3 rounded-lg border p-3 text-left transition-colors",
                      on ? "border-foreground bg-card" : "border-border bg-background opacity-60",
                    )}
                  >
                    <PieceThumb
                      lookSrc={lookSrc}
                      x={piece.x}
                      y={piece.y}
                      productSrc={cheap?.imageUrl}
                      alt={piece.name}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{piece.name}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {[piece.brand, ...piece.offers.map((offer) => retailerLabel(offer))]
                          .filter(Boolean)
                          .filter((label, i, all) => all.indexOf(label) === i)
                          .join(" · ")}
                      </span>
                      {piece.offers.length > 0 ? (
                        <span className="mt-2 flex flex-wrap gap-1">
                          {piece.offers.map((offer) => (
                            <Badge key={offer.url} variant="muted">
                              {retailerLabel(offer)}
                              {offer.price ? ` ${formatMoney(offer.price, offer.currency)}` : ""}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="mt-2 block text-xs text-muted-foreground">
                          Pin it anyway — you can search shops next.
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Discard
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              onAccept(selected);
              onOpenChange(false);
            }}
          >
            Pin {selected.length} {selected.length === 1 ? "piece" : "pieces"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
