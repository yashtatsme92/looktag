import { preload } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import {
  FEED_GRID_SIZES,
  feedBox,
  feedEntryFor,
  feedSrcSet,
  largestSource,
} from "@/lib/media/feed-image";
import { cn } from "@/lib/utils";

type ImgSlotProps = ImgHTMLAttributes<HTMLImageElement> & {
  aspectRatio?: string;
  className?: string;
  slotClassName?: string;
  /** Hero and lead photos stay put: no fade (L9). */
  still?: boolean;
  /** Above-the-fold. Eager, fetchpriority high, one AVIF preload. */
  priority?: boolean;
  /** Use the original file. Detail galleries pass this. */
  feed?: boolean;
  sizes?: string;
};

export function ImgSlot({
  aspectRatio = "3 / 4",
  className,
  slotClassName,
  still = false,
  priority = false,
  feed = true,
  sizes,
  onLoad,
  src,
  alt = "",
  loading,
  decoding,
  fetchPriority,
  width,
  height,
  ...imageProps
}: ImgSlotProps) {
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const entry = feed ? feedEntryFor(typeof src === "string" ? src : "") : null;
  const box = entry ? feedBox(entry) : null;
  const imageSizes = sizes ?? (entry ? FEED_GRID_SIZES : undefined);
  const avif = entry ? feedSrcSet(entry.avif) : "";
  const webp = entry ? feedSrcSet(entry.webp) : "";
  const jpeg = entry ? feedSrcSet(entry.jpeg) : "";
  const fallback = entry ? largestSource(entry.jpeg) : null;
  const avifHref = entry ? largestSource(entry.avif)?.url : undefined;

  if (priority && avif && avifHref && imageSizes) {
    preload(avifHref, {
      as: "image",
      type: "image/avif",
      fetchPriority: "high",
      imageSrcSet: avif,
      imageSizes,
    });
  }

  useEffect(() => {
    const image = imageRef.current;
    setLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [src]);

  const img = (
    <img
      ref={imageRef}
      {...imageProps}
      alt={alt}
      src={fallback?.url ?? src}
      srcSet={jpeg || undefined}
      sizes={jpeg ? imageSizes : undefined}
      width={width ?? box?.width}
      height={height ?? box?.height}
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

  return (
    <div
      className={cn("img-slot", slotClassName)}
      data-still={still ? "true" : undefined}
      style={{ "--ar": aspectRatio } as CSSProperties}
    >
      {entry && avif ? (
        <picture>
          <source type="image/avif" srcSet={avif} sizes={imageSizes} />
          {webp ? <source type="image/webp" srcSet={webp} sizes={imageSizes} /> : null}
          {img}
        </picture>
      ) : (
        img
      )}
    </div>
  );
}
