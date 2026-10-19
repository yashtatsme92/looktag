import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ImgSlotProps = ImgHTMLAttributes<HTMLImageElement> & {
  aspectRatio?: string;
  className?: string;
  slotClassName?: string;
  /** Hero and lead photos stay put: no fade (L9). */
  still?: boolean;
};

export function ImgSlot({
  aspectRatio = "3 / 4",
  className,
  slotClassName,
  still = false,
  onLoad,
  src,
  ...imageProps
}: ImgSlotProps) {
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    setLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [src]);

  return (
    <div
      className={cn("img-slot", slotClassName)}
      data-still={still ? "true" : undefined}
      style={{ "--ar": aspectRatio } as CSSProperties}
      ref={(node) => {
        if (!node) return;
        if (src) node.setAttribute("src", src);
        else node.removeAttribute("src");
      }}
    >
      <img
        ref={imageRef}
        {...imageProps}
        src={src}
        className={cn(className, (loaded || still) && "is-loaded")}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
      />
    </div>
  );
}
