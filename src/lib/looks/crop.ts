export type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function centeredCrop(imageWidth: number, imageHeight: number): CropRect {
  if (imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  const imageRatio = imageWidth / imageHeight;
  if (imageRatio > 3 / 4) {
    const w = (imageHeight * 3) / 4 / imageWidth;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = (imageWidth * 4) / 3 / imageHeight;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
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
  const width = crop.h * (frameWidth / frameHeight) * (imageHeight / imageWidth);
  const w = Math.min(1, Math.max(Number.EPSILON, width));
  const h = Math.min(1, Math.max(Number.EPSILON, crop.h));
  const x = clamp(crop.x + crop.w / 2 - w / 2, 0, 1 - w);
  return { x, y: clamp(crop.y, 0, 1 - h), w, h };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
