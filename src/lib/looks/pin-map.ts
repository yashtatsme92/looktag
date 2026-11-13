/** CSS `object-position: center 20%` — keep in lockstep with `.look-photo-img`. */
export const COVER_POS_X = 0.5;
export const COVER_POS_Y = 0.2;

export type CoverBox = {
  frameW: number;
  frameH: number;
  imgW: number;
  imgH: number;
  posX?: number;
  posY?: number;
};

export type Point = { x: number; y: number };

export function coverLayout(box: CoverBox) {
  const posX = box.posX ?? COVER_POS_X;
  const posY = box.posY ?? COVER_POS_Y;
  const frameRatio = box.frameW / box.frameH;
  const imgRatio = box.imgW / box.imgH;
  let renderW: number;
  let renderH: number;
  let offsetX: number;
  let offsetY: number;
  if (imgRatio > frameRatio) {
    renderH = box.frameH;
    renderW = box.frameH * imgRatio;
    offsetY = 0;
    offsetX = (box.frameW - renderW) * posX;
  } else {
    renderW = box.frameW;
    renderH = box.frameW / imgRatio;
    offsetX = 0;
    offsetY = (box.frameH - renderH) * posY;
  }
  return { renderW, renderH, offsetX, offsetY };
}

export function imagePercentToFrame(x: number, y: number, box: CoverBox): Point {
  if (box.frameW <= 0 || box.frameH <= 0 || box.imgW <= 0 || box.imgH <= 0) {
    return { x, y };
  }
  const { renderW, renderH, offsetX, offsetY } = coverLayout(box);
  return {
    x: ((offsetX + (x / 100) * renderW) / box.frameW) * 100,
    y: ((offsetY + (y / 100) * renderH) / box.frameH) * 100,
  };
}

export function framePercentToImage(x: number, y: number, box: CoverBox): Point {
  if (box.frameW <= 0 || box.frameH <= 0 || box.imgW <= 0 || box.imgH <= 0) {
    return { x, y };
  }
  const { renderW, renderH, offsetX, offsetY } = coverLayout(box);
  if (renderW <= 0 || renderH <= 0) return { x, y };
  return {
    x: (((x / 100) * box.frameW - offsetX) / renderW) * 100,
    y: (((y / 100) * box.frameH - offsetY) / renderH) * 100,
  };
}

export function clampPin(n: number) {
  if (!Number.isFinite(n)) return 50;
  return Math.min(99, Math.max(1, Math.round(n * 10) / 10));
}

export function clampPoint(point: Point): Point {
  return { x: clampPin(point.x), y: clampPin(point.y) };
}

export function inFrame(point: Point, pad = 8) {
  return point.x >= -pad && point.x <= 100 + pad && point.y >= -pad && point.y <= 100 + pad;
}

/** Map a stored pin (0–100 on the photo) through the visible crop window into frame percent. */
export function pinInCrop(
  tag: { x: number; y: number },
  crop: { x: number; y: number; w: number; h: number } | null | undefined,
): { x: number; y: number; inside: boolean } {
  if (!crop || !(crop.w > 0) || !(crop.h > 0)) {
    const inside = tag.x >= 0 && tag.x <= 100 && tag.y >= 0 && tag.y <= 100;
    return { x: tag.x, y: tag.y, inside };
  }
  const x = ((tag.x / 100 - crop.x) / crop.w) * 100;
  const y = ((tag.y / 100 - crop.y) / crop.h) * 100;
  const inside = x >= -0.5 && x <= 100.5 && y >= -0.5 && y <= 100.5;
  return { x, y, inside };
}

/**
 * Shift a pin that sits within `edgePx` of the frame so the dot is fully inside.
 * The returned delta is in pixels from the true point. A non-zero delta wants a leader.
 */
export function nudgePinInside(
  xPercent: number,
  yPercent: number,
  frameW: number,
  frameH: number,
  edgePx = 16,
): { dx: number; dy: number; leader: boolean } {
  if (!(frameW > 0) || !(frameH > 0)) return { dx: 0, dy: 0, leader: false };
  const px = (xPercent / 100) * frameW;
  const py = (yPercent / 100) * frameH;
  const nx = Math.min(frameW - edgePx, Math.max(edgePx, px));
  const ny = Math.min(frameH - edgePx, Math.max(edgePx, py));
  const dx = nx - px;
  const dy = ny - py;
  return { dx, dy, leader: Math.hypot(dx, dy) > 0.5 };
}

/**
 * Vertical object-position (0..1) that centres the pins' span in a cover window, so a
 * photo cropped into a short card still shows every pin. Falls back to the shared default.
 */
export function focusPosY(tags: ReadonlyArray<{ y: number }>, frameRatio: number, imgRatio: number): number {
  if (!(frameRatio > 0) || !(imgRatio > 0) || tags.length === 0) return COVER_POS_Y;
  const visible = Math.min(1, imgRatio / frameRatio); // fraction of the image height that shows
  if (visible >= 1) return COVER_POS_Y;
  const ys = tags.map((t) => t.y / 100);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const start = Math.min(1 - visible, Math.max(0, mid - visible / 2));
  return start / (1 - visible);
}
