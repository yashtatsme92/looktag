import { useState } from "react";
import { cn } from "@/lib/utils";

type PieceThumbProps = {
  lookSrc?: string;
  x?: number;
  y?: number;
  productSrc?: string;
  size?: "sm" | "md";
  alt?: string;
};

/** Crop of the look at the pin, with the shop still on top when it loads. */
export function PieceThumb({ lookSrc, x = 50, y = 50, productSrc, size = "md", alt = "" }: PieceThumbProps) {
  const [broken, setBroken] = useState(false);
  const showProduct = Boolean(productSrc) && !broken;

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md bg-muted",
        size === "sm" ? "size-11" : "size-16",
      )}
      aria-hidden={!alt}
    >
      {lookSrc ? (
        <span
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(${JSON.stringify(lookSrc)})`,
            backgroundPosition: `${x}% ${y}%`,
            backgroundSize: "260%",
          }}
        />
      ) : null}
      {showProduct ? (
        <img
          src={productSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : null}
    </span>
  );
}
