import { centeredCrop as sharedCenteredCrop } from "../../../scripts/centered-crop.mjs";

export type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function centeredCrop(imageWidth: number, imageHeight: number): CropRect {
  return sharedCenteredCrop(imageWidth, imageHeight);
}

export function zoomMax(imageWidth: number, imageHeight: number): number {
  return zoomMaxForCrop(imageWidth, imageHeight, centeredCrop(imageWidth, imageHeight));
}

export function zoomMaxForCrop(imageWidth: number, imageHeight: number, crop: CropRect): number {
  return clamp((crop.w * imageWidth) / 1080, 1, 3);
}

export function cropAtZoom(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  panX = 0,
  panY = 0,
): CropRect {
  return zoomCrop(centeredCrop(imageWidth, imageHeight), zoom, panX, panY);
}

export function zoomCrop(base: CropRect, zoom: number, panX = 0, panY = 0): CropRect {
  const factor = Math.max(1, zoom);
  const w = base.w / factor;
  const h = base.h / factor;
  const x = clamp((base.x + (base.w - w) / 2 + panX), 0, 1 - w);
  const y = clamp((base.y + (base.h - h) / 2 + panY), 0, 1 - h);
  return { x, y, w, h };
}

export function panCrop(crop: CropRect, dx: number, dy: number): CropRect {
  return clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
}

export function clampCrop(crop: CropRect): CropRect {
  const w = clamp(crop.w, Number.EPSILON, 1);
  const h = clamp(crop.h, Number.EPSILON, 1);
  return {
    x: clamp(crop.x, 0, 1 - w),
    y: clamp(crop.y, 0, 1 - h),
    w,
    h,
  };
}

export function visibleCrop(
  crop: CropRect,
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): CropRect {
  if (imageWidth <= 0 || imageHeight <= 0 || frameWidth <= 0 || frameHeight <= 0 || crop.h <= 0) {
    return crop;
  }
  const ratio = (frameWidth / frameHeight) * (imageHeight / imageWidth);
  let w = crop.h * ratio;
  let h = crop.h;
  if (w > 1) {
    w = 1;
    h = w / ratio;
  }
  if (h > 1) {
    h = 1;
    w = h * ratio;
  }
  w = Math.min(1, Math.max(Number.EPSILON, w));
  h = Math.min(1, Math.max(Number.EPSILON, h));
  const x = clamp(crop.x + crop.w / 2 - w / 2, 0, 1 - w);
  const y = clamp(crop.y + crop.h / 2 - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
