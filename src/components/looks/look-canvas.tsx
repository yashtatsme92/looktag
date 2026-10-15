import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { ImagePlus } from "lucide-react";
import { TagPin } from "@/components/looks/tag-pin";
import {
  inFrame,
} from "@/lib/looks/pin-map";
import { centeredCrop, visibleCrop, type CropRect } from "@/lib/looks/crop";
import type { ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type LookCanvasProps = {
  imageSrc: string;
  title: string;
  tags: ProductTag[];
  selectedId?: string | null;
  editable?: boolean;
  showTags?: boolean;
  onSelect?: (id: string | null) => void;
  onAddTag?: (x: number, y: number) => void;
  onMoveTag?: (id: string, x: number, y: number) => void;
  onPickImage?: () => void;
  className?: string;
  fit?: "natural" | "cover" | "fill";
  onImageTap?: () => void;
  /** Phone create opens the piece card on a tap, not on the drag that starts a move. */
  selectOnTap?: boolean;
  crop?: CropRect;
};

export function LookCanvas({
  imageSrc,
  title,
  tags,
  selectedId,
  editable,
  showTags = true,
  onSelect,
  onAddTag,
  onMoveTag,
  onPickImage,
  className,
  fit = "natural",
  onImageTap,
  selectOnTap,
  crop,
}: LookCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const cropped = fit !== "natural";

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const read = () => {
      const rect = el.getBoundingClientRect();
      setFrame({ w: rect.width, h: rect.height });
    };
    read();
    const img = el.querySelector("img");
    if (img?.complete && img.naturalWidth) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imageSrc]);

  const cropWindow =
    cropped && natural && frame && frame.w > 0 && frame.h > 0
      ? visibleCrop(
          crop ?? centeredCrop(natural.w, natural.h),
          natural.w,
          natural.h,
          frame.w,
          frame.h,
        )
      : null;

  const imageStyle =
    cropWindow && frame
      ? {
          width: `${(100 / cropWindow.w).toFixed(5)}%`,
          height: `${(100 / cropWindow.h).toFixed(5)}%`,
          left: `${((-cropWindow.x / cropWindow.w) * 100).toFixed(5)}%`,
          top: `${((-cropWindow.y / cropWindow.h) * 100).toFixed(5)}%`,
          right: "auto",
          bottom: "auto",
          maxWidth: "none",
          objectFit: "cover" as const,
        }
      : undefined;

  function pointToFramePercent(clientX: number, clientY: number) {
    const node = frameRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    if (x < 1 || x > 99 || y < 1 || y > 99) return null;
    return { x, y };
  }

  function pointToImagePercent(clientX: number, clientY: number) {
    const framePoint = pointToFramePercent(clientX, clientY);
    if (!framePoint) return null;
    if (!cropWindow) return framePoint;
    return {
      x: cropWindow.x * 100 + (framePoint.x / 100) * cropWindow.w * 100,
      y: cropWindow.y * 100 + (framePoint.y / 100) * cropWindow.h * 100,
    };
  }

  function handleFrameClick(event: MouseEvent<HTMLDivElement>) {
    if (!editable || !imageSrc) return;
    if (dragRef.current?.moved) return;
    const point = pointToImagePercent(event.clientX, event.clientY);
    if (!point) return;
    onAddTag?.(point.x, point.y);
  }

  function handlePinPointerDown(id: string, event: PointerEvent<HTMLButtonElement>) {
    if (!editable) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, moved: false };

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const point = pointToImagePercent(moveEvent.clientX, moveEvent.clientY);
      if (!point || !dragRef.current) return;
      dragRef.current.moved = true;
      onMoveTag?.(id, point.x, point.y);
    };
    const onUp = () => {
      const moved = dragRef.current?.moved ?? false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (selectOnTap && moved) {
        const stop = (event: Event) => {
          event.stopPropagation();
          event.preventDefault();
          window.removeEventListener("click", stop, true);
        };
        window.addEventListener("click", stop, true);
      }
      window.setTimeout(() => {
        dragRef.current = null;
      }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    if (!selectOnTap) onSelect?.(id);
  }

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative overflow-hidden bg-muted",
        !imageSrc && "h-96",
        fit !== "fill" && "rounded-xl",
        fit === "cover" && "look-photo-cover",
        fit === "fill" && "h-full w-full rounded-none",
        editable && imageSrc && "cursor-crosshair",
        className,
      )}
      onClick={handleFrameClick}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={title || "Look"}
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            }
          }}
          style={imageStyle}
          className={cn(
            "look-photo-img block select-none",
            fit === "natural" && "w-full",
            fit !== "natural" && !imageStyle && "absolute inset-0 h-full w-full object-cover",
            fit !== "natural" && imageStyle && "absolute",
          )}
        />
      ) : (
        <button
          type="button"
          onClick={onPickImage}
          className="flex h-full min-h-11 w-full flex-col items-center justify-center gap-3 px-8 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-card text-foreground shadow-[var(--shadow-border)]">
            <ImagePlus className="size-5" />
          </span>
          <span className="ds-display text-2xl">Add a look photo</span>
          <span className="max-w-56 text-sm text-muted-foreground">
            Take a full-body shot, then pin each piece.
          </span>
        </button>
      )}

      {imageSrc && onImageTap && !editable ? (
        <button
          type="button"
          className="look-slide-hit"
          aria-label={title ? `Look, ${title}` : "Look"}
        />
      ) : null}

      {showTags && (!cropped || natural)
        ? tags.map((tag, index) => {
            const point = cropWindow
              ? {
                  x: ((tag.x / 100 - cropWindow.x) / cropWindow.w) * 100,
                  y: ((tag.y / 100 - cropWindow.y) / cropWindow.h) * 100,
                }
              : { x: tag.x, y: tag.y };
            if (!inFrame(point)) return null;
            return (
              <TagPin
                key={tag.id}
                index={index}
                x={point.x}
                y={point.y}
                selected={selectedId === tag.id}
                pulse={!editable}
                label={tag.name || `Item ${index + 1}`}
                onSelect={() => onSelect?.(tag.id)}
                onPointerDown={(event) => handlePinPointerDown(tag.id, event)}
              />
            );
          })
        : null}
    </div>
  );
}
