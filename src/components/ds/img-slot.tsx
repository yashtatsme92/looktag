import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  FEED_GRID_SIZES,
  FEED_LEAD_SIZES,
  FEED_PLATE_SIZES,
  formatSrcSet,
  type LookImages,
} from "@/lib/looks/image-variants";

type ImgSlotProps = ImgHTMLAttributes<HTMLImageElement> & {
  aspectRatio?: string;
  className?: string;
  slotClassName?: string;
  /** Hero and lead photos stay put: no fade (L9). */
  still?: boolean;
  /** Sized storage URLs. When set, the slot renders picture/srcset. */
  images?: LookImages;
  /** Above-the-fold photo: eager load, high priority. Everything else is lazy. */
  priority?: boolean;
};

export { FEED_GRID_SIZES, FEED_LEAD_SIZES, FEED_PLATE_SIZES };

export function lookPhotoProps(
  look: { imageSrc: string; images?: LookImages },
  options?: { sizes?: string; priority?: boolean },
) {
  return {
    src: look.imageSrc,
    images: look.images,
    sizes: options?.sizes ?? (look.images ? FEED_GRID_SIZES : undefined),
    priority: options?.priority,
  };
}

export function ImgSlot({
  aspectRatio = "3 / 4",
  className,
  slotClassName,
  still = false,
  images,
  priority = false,
  onLoad,
  src,
  sizes,
  loading,
  decoding,
  fetchPriority,
  ...imageProps
}: ImgSlotProps) {
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const shown = images?.jpeg.detail || images?.detail || src;

  useEffect(() => {
    const image = imageRef.current;
    setLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [shown]);

  const img = (
    <img
      ref={imageRef}
      {...imageProps}
      src={shown}
      srcSet={images ? formatSrcSet(images, "jpeg") : undefined}
      sizes={images ? sizes : undefined}
      width={images?.width}
      height={images?.height}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding ?? "async"}
      fetchPriority={fetchPriority ?? (priority ? "high" : undefined)}
      className={cn(className, (loaded || still) && "is-loaded")}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
    />
  );
  const webp = images ? formatSrcSet(images, "webp") : "";
  const avif = images ? formatSrcSet(images, "avif") : "";

  return (
    <div
      className={cn("img-slot", slotClassName)}
      data-still={still ? "true" : undefined}
      style={{ "--ar": aspectRatio } as CSSProperties}
    >
      {images && (webp || avif) ? (
        <picture>
          {avif ? <source type="image/avif" srcSet={avif} sizes={sizes} /> : null}
          {webp ? <source type="image/webp" srcSet={webp} sizes={sizes} /> : null}
          {img}
        </picture>
      ) : (
        img
      )}
    </div>
  );
}
