import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ImgSlotProps = ImgHTMLAttributes<HTMLImageElement> & {
  aspectRatio?: string;
  className?: string;
  slotClassName?: string;
};

export function ImgSlot({
  aspectRatio = "3 / 4",
  className,
  slotClassName,
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
      style={{ "--ar": aspectRatio } as CSSProperties}
    >
      <img
        ref={imageRef}
        {...imageProps}
        src={src}
        className={cn(className, loaded && "is-loaded")}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
      />
    </div>
  );
}
