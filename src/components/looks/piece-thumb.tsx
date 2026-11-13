import { useEffect, useRef, useState } from "react";
import { ImgSlot } from "@/components/ds/img-slot";
import { pieceThumbCrop } from "@/lib/looks/piece-thumb";
import { cn } from "@/lib/utils";

type PieceThumbProps = {
  lookSrc?: string;
  x?: number;
  y?: number;
  productSrc?: string;
  size?: "sm" | "md";
  alt?: string;
  className?: string;
};

/** Crop of the look centred on the pin, with the shop still on top when it loads. */
export function PieceThumb({ lookSrc, x = 50, y = 50, productSrc, size = "md", alt = "", className }: PieceThumbProps) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const [broken, setBroken] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [thumb, setThumb] = useState(0);
  const showProduct = Boolean(productSrc) && !broken;

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const read = () => setThumb(node.clientWidth || node.getBoundingClientRect().width || 0);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [lookSrc, className, size]);

  const crop =
    natural && thumb > 0
      ? pieceThumbCrop({ imageWidth: natural.w, imageHeight: natural.h, x, y, thumb })
      : null;

  return (
    <span
      ref={frameRef}
      className={cn(
        "piece-thumb relative shrink-0 overflow-hidden bg-muted",
        className ?? (size === "sm" ? "size-11 rounded-md" : "size-16 rounded-md"),
      )}
      aria-hidden={!alt}
      data-pin-x={x}
      data-pin-y={y}
      data-crop-left={crop ? crop.left.toFixed(2) : undefined}
      data-crop-top={crop ? crop.top.toFixed(2) : undefined}
      data-crop-w={crop ? crop.width.toFixed(2) : undefined}
      data-crop-h={crop ? crop.height.toFixed(2) : undefined}
    >
      {lookSrc ? (
        <img
          src={lookSrc}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none object-cover"
          style={
            crop
              ? { left: crop.left, top: crop.top, width: crop.width, height: crop.height }
              : { visibility: "hidden" }
          }
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth && img.naturalHeight) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      ) : null}
      {showProduct ? (
        <ImgSlot
          src={productSrc}
          alt={alt}
          aspectRatio="1 / 1"
          slotClassName="img-slot-fill absolute inset-0"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : null}
    </span>
  );
}
