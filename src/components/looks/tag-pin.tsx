import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";

type TagPinProps = {
  id?: string;
  index: number;
  x: number;
  y: number;
  imageX?: number;
  imageY?: number;
  selected?: boolean;
  label?: string;
  /** Pixel shift of the 28px dot so it stays inside the frame. The button stays on the stored point. */
  nudge?: { dx: number; dy: number; leader: boolean };
  onSelect?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function TagPin({
  id,
  index,
  x,
  y,
  imageX,
  imageY,
  selected,
  label,
  nudge,
  onSelect,
  onPointerDown,
}: TagPinProps) {
  const dx = nudge?.dx ?? 0;
  const dy = nudge?.dy ?? 0;
  const leader = Boolean(nudge?.leader);
  const length = Math.hypot(dx, dy);
  return (
    <button
      type="button"
      data-tag-pin
      data-tag-id={id}
      data-image-x={imageX}
      data-image-y={imageY}
      aria-label={label ?? `Item ${index + 1}`}
      aria-pressed={selected ? true : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      onPointerDown={onPointerDown}
      className={cn("tag-pin", selected && "is-selected")}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {leader ? (
        <span
          className="tag-pin-leader"
          aria-hidden
          style={{ width: length, transform: `rotate(${Math.atan2(dy, dx)}rad)` }}
        />
      ) : null}
      <span
        className="tag-pin-dot"
        style={dx || dy ? { transform: `translate(${dx}px, ${dy}px)` } : undefined}
      >
        {index + 1}
      </span>
    </button>
  );
}
