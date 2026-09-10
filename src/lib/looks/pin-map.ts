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
