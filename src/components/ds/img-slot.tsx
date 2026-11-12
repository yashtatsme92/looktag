import { preload } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import {
  FEED_GRID_SIZES,
  feedBox,
  feedEntryFor,
  feedSrcSet,
  largestSource,
} from "@/lib/media/feed-image";
import { formatSrcSet, type LookImages } from "@/lib/looks/image-variants";
import { cn } from "@/lib/utils";

type ImgSlotProps = ImgHTMLAttributes<HTMLImageElement> & {
  aspectRatio?: string;
  className?: string;
  slotClassName?: string;
  /** Hero and lead photos stay put: no fade (L9). */
  still?: boolean;
  /** Storage derivatives from an uploaded or migrated look. Wins over the seed manifest. */
  images?: LookImages;
  /** Above-the-fold. Eager, fetchpriority high, one preload. */
  priority?: boolean;
  /** Use the seed-photo manifest. Detail galleries pass false. Ignored when `images` is set. */
  feed?: boolean;
  sizes?: string;
};

export function lookPhotoProps(
  look: { imageSrc: string; images?: LookImages },
  options?: { sizes?: string; priority?: boolean; feed?: boolean },
) {
  return {
    src: look.imageSrc,
    images: look.images,
    sizes: options?.sizes,
    priority: options?.priority,
    feed: options?.feed ?? !look.images,
  };
}

export function ImgSlot({
  aspectRatio = "3 / 4",
  className,
  slotClassName,
  still = false,
  images,
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
  const entry = !images && feed ? feedEntryFor(typeof src === "string" ? src : "") : null;
  const box = entry ? feedBox(entry) : null;
  const imageSizes = sizes ?? (images || entry ? FEED_GRID_SIZES : undefined);
  const avif = images ? formatSrcSet(images, "avif") : entry ? feedSrcSet(entry.avif) : "";
  const webp = images ? formatSrcSet(images, "webp") : entry ? feedSrcSet(entry.webp) : "";
  const jpeg = images ? formatSrcSet(images, "jpeg") : entry ? feedSrcSet(entry.jpeg) : "";
  const fallbackSrc = images
    ? images.jpeg.detail || images.detail || src
    : (entry ? largestSource(entry.jpeg)?.url : undefined) ?? src;
  const avifHref = images?.avif?.detail || (entry ? largestSource(entry.avif)?.url : undefined);
  const preloadHref = avifHref || (images && priority ? images.detail : undefined);
  const preloadSet = avifHref ? avif : webp;

  if (priority && preloadHref && preloadSet && imageSizes) {
    preload(preloadHref, {
      as: "image",
      type: avifHref ? "image/avif" : "image/webp",
      fetchPriority: "high",
      imageSrcSet: preloadSet,
      imageSizes,
    });
  }

  useEffect(() => {
    const image = imageRef.current;
    setLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [fallbackSrc]);

  const img = (
    <img
      ref={imageRef}
      {...imageProps}
      alt={alt}
      src={fallbackSrc}
      srcSet={jpeg || undefined}
      sizes={jpeg ? imageSizes : undefined}
      width={width ?? images?.width ?? box?.width}
      height={height ?? images?.height ?? box?.height}
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
      {(images || entry) && (avif || webp) ? (
        <picture>
          {avif ? <source type="image/avif" srcSet={avif} sizes={imageSizes} /> : null}
          {webp ? <source type="image/webp" srcSet={webp} sizes={imageSizes} /> : null}
          {img}
        </picture>
      ) : (
        img
      )}
    </div>
  );
}
