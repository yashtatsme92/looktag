import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";

type TagPinProps = {
  index: number;
  x: number;
  y: number;
  selected?: boolean;
  pulse?: boolean;
  label?: string;
  onSelect?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function TagPin({
  index,
  x,
  y,
  selected,
  pulse,
  label,
  onSelect,
  onPointerDown,
}: TagPinProps) {
  return (
    <button
      type="button"
      data-tag-pin
      aria-label={label ?? `Item ${index + 1}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      onPointerDown={onPointerDown}
      className={cn(
        "tag-pin absolute z-20 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[0.6875rem] font-medium tabular-nums shadow-sm transition-[transform,background-color,color,border-color] duration-150 after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary/20 bg-card text-foreground hover:border-primary",
        pulse && !selected && "pin-pulse",
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {index + 1}
    </button>
  );
}
