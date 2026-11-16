import type { LookImages } from "./image-variants";
import type { CropRect } from "./crop.ts";

/** Width/height within 1% of 3:4. */
export function isThreeByFour(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  return Math.abs(width / height / 0.75 - 1) <= 0.01;
}

/**
 * legacy: no stored original. Keep the current plate, pins, and hidden-piece chip.
 * crop: original is known but the file is not a baked 3:4 yet. Frame 3:4 and map pins through the crop.
 * baked: variants are already 3:4. Show them 1:1 and map pins through the crop.
 */
export type PhotoFrameMode = "legacy" | "crop" | "baked";

export function photoFrameMode(images?: Pick<LookImages, "original" | "width" | "height"> | null): PhotoFrameMode {
  if (!images?.original) return "legacy";
  return isThreeByFour(images.width, images.height) ? "baked" : "crop";
}

type PlateLook = {
  id: string;
  images?: Pick<LookImages, "original"> | null;
  crop?: CropRect;
};

/**
 * The in-memory catalog starts as the static seed, which has no photo manifest.
 * The loader row is the one that knows whether an original exists. Prefer that
 * manifest so a seed exercises the 3:4 path and an unmigrated upload stays legacy.
 */
export function displayedLook<T extends PlateLook>(
  storeLook: T | undefined,
  loaderLook: T | null | undefined,
  lookId: string,
): T | undefined {
  const loader = loaderLook && loaderLook.id === lookId ? loaderLook : undefined;
  if (!storeLook) return loader;
  if (!loader) return storeLook;
  if (storeLook.images?.original) return storeLook;
  return {
    ...storeLook,
    images: loader.images ?? storeLook.images,
    crop: storeLook.crop ?? loader.crop,
  };
}
