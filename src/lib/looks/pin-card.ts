/** Placement of the pin spotlight card so it never hides another pin. All numbers are pixels inside the plate. */
export type PinPoint = { id: string; x: number; y: number };

export type PinCardInput = {
  pins: PinPoint[];
  selectedId: string;
  plate: { w: number; h: number };
  card: { w: number; h: number };
  /** Space the card must keep clear: the top bar above and the caption block below. */
  inset: { top: number; bottom: number };
  /** Gap kept between the card and the plate edge. */
  margin: number;
  /** Clearance around a pin centre (the pin radius plus breathing room). */
  pinRadius: number;
  /** Phone: the card spans the width, so only its vertical position moves. */
  fixedX?: boolean;
};

export type PinCardPlacement = { left: number; top: number; covered: string[]; coversSelected: boolean };

function range(min: number, max: number, step: number): number[] {
  if (max <= min) return [min];
  const out: number[] = [];
  for (let value = min; value < max; value += step) out.push(value);
  out.push(max);
  return out;
}

function covers(rect: { left: number; top: number; w: number; h: number }, pin: PinPoint, radius: number): boolean {
  const nearestX = Math.max(rect.left, Math.min(pin.x, rect.left + rect.w));
  const nearestY = Math.max(rect.top, Math.min(pin.y, rect.top + rect.h));
  return Math.hypot(pin.x - nearestX, pin.y - nearestY) < radius;
}

function gap(rect: { left: number; top: number; w: number; h: number }, pin: PinPoint): number {
  const nearestX = Math.max(rect.left, Math.min(pin.x, rect.left + rect.w));
  const nearestY = Math.max(rect.top, Math.min(pin.y, rect.top + rect.h));
  return Math.hypot(pin.x - nearestX, pin.y - nearestY);
}

/** Penalties, strongest first: hiding the selected pin, hiding any other pin, sitting on the caption block, then distance. */
const SELECTED_COVERED = 1_000_000_000;
const OTHER_COVERED = 1_000_000;
const CAPTION_PX = 200;

/**
 * Picks the position closest to the selected pin where the card covers no pin at all, the selected one included.
 * When every position hides something it never trades the selected pin away: it hides the fewest others, and only
 * then lets the card sit over the caption block (below `inset.bottom`) before it would cover a pin.
 */
export function placePinCard(input: PinCardInput): PinCardPlacement {
  const { pins, selectedId, plate, card, inset, margin, pinRadius, fixedX } = input;
  const selected = pins.find((pin) => pin.id === selectedId);
  const xs = fixedX ? [margin] : range(margin, plate.w - card.w - margin, 16);
  const captionTop = plate.h - inset.bottom;
  const ys = range(inset.top, Math.max(inset.top, plate.h - margin - card.h), 8);
  let best: PinCardPlacement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const top of ys) {
    for (const left of xs) {
      const rect = { left, top, w: card.w, h: card.h };
      const covered = pins.filter((pin) => covers(rect, pin, pinRadius)).map((pin) => pin.id);
      const coversSelected = covered.includes(selectedId);
      const others = covered.length - (coversSelected ? 1 : 0);
      const captionOverlap = Math.max(0, top + card.h - captionTop);
      const near = selected ? gap(rect, selected) : 0;
      const score = (coversSelected ? SELECTED_COVERED : 0) + others * OTHER_COVERED + captionOverlap * CAPTION_PX + near;
      if (score < bestScore) {
        bestScore = score;
        best = { left, top, covered, coversSelected };
      }
    }
  }
  return best ?? { left: margin, top: inset.top, covered: [], coversSelected: false };
}

export const PIN_POINTER_MAX_PX = 12;
/** Border-box gap that puts a 12px caret tip 6px from the pin — inside 8px, outside the 16px card halo. */
export const PIN_POINTER_GAP_PX = 18;

export type CardRect = { left: number; top: number; w: number; h: number };
export type PinEdge = "top" | "right" | "bottom" | "left";

export type PinPointer = {
  edge: PinEdge;
  size: number;
  /** Top-left of the caret box, in the same coordinate space as the card. */
  left: number;
  top: number;
  /** From the card border to the caret base, when the card is clamped too far for a 12px caret. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

export function pinPointerTip(pointer: PinPointer): { x: number; y: number } {
  if (pointer.edge === "left") return { x: pointer.left, y: pointer.top + pointer.size / 2 };
  if (pointer.edge === "right") return { x: pointer.left + pointer.size, y: pointer.top + pointer.size / 2 };
  if (pointer.edge === "top") return { x: pointer.left + pointer.size / 2, y: pointer.top };
  return { x: pointer.left + pointer.size / 2, y: pointer.top + pointer.size };
}

/** The card edge the pin sits beyond, so the caret can leave that side. */
export function pinCardEdge(card: CardRect, pin: { x: number; y: number }): PinEdge {
  const vx = pin.x - (card.left + card.w / 2);
  const vy = pin.y - (card.top + card.h / 2);
  if (Math.abs(vx) * card.h >= Math.abs(vy) * card.w) return vx >= 0 ? "right" : "left";
  return vy >= 0 ? "bottom" : "top";
}

function slideToGap(card: CardRect, pin: { x: number; y: number }, edge: PinEdge, gapPx: number): CardRect {
  const next = { left: card.left, top: card.top, w: card.w, h: card.h };
  const pad = 8;
  if (edge === "right" || edge === "left") {
    next.left = edge === "right" ? pin.x - gapPx - card.w : pin.x + gapPx;
    next.top = clamp(card.top, pin.y - (card.h - pad), pin.y - pad);
  } else {
    next.top = edge === "bottom" ? pin.y - gapPx - card.h : pin.y + gapPx;
    next.left = clamp(card.left, pin.x - (card.w - pad), pin.x - pad);
  }
  return next;
}

/**
 * Slides a tablet card until the facing edge is {@link PIN_POINTER_GAP_PX} from the pin,
 * without covering that pin or any other, and without leaving the plate.
 * Returns the original rect when the closer spot is blocked.
 */
export function nudgeCardForPointer(
  card: CardRect,
  pin: { x: number; y: number },
  limits: { minLeft: number; maxLeft: number; minTop: number; maxTop: number },
  blockers: Array<{ x: number; y: number }>,
  blockerRadius = 22,
  gapPx = PIN_POINTER_GAP_PX,
): CardRect {
  const pinPoint = { id: "", x: pin.x, y: pin.y };
  const edges: PinEdge[] = [pinCardEdge(card, pin), "left", "right", "top", "bottom"];
  let best = card;
  let bestGap = gap(card, pinPoint);
  const seen = new Set<PinEdge>();
  for (const edge of edges) {
    if (seen.has(edge)) continue;
    seen.add(edge);
    const target = slideToGap(card, pin, edge, gapPx);
    target.left = clamp(target.left, limits.minLeft, limits.maxLeft);
    target.top = clamp(target.top, limits.minTop, limits.maxTop);
    const selectedClear = !covers(target, pinPoint, 17);
    const othersClear = blockers.every((other) => !covers(target, { id: "", x: other.x, y: other.y }, blockerRadius));
    if (!selectedClear || !othersClear) continue;
    const nextGap = gap(target, pinPoint);
    if (nextGap < bestGap - 0.5) {
      best = target;
      bestGap = nextGap;
    }
  }
  return best;
}

/** A caret of at most 12px aimed at the pin. It sits on the card edge when that reaches, and walks toward the pin when the card is clamped. */
export function pinCardPointer(card: CardRect, pin: { x: number; y: number }, max = PIN_POINTER_MAX_PX): PinPointer {
  const nearest = nearestBorder(card, pin);
  let dx = pin.x - nearest.x;
  let dy = pin.y - nearest.y;
  let dist = Math.hypot(dx, dy);
  if (dist < 0.5) {
    const fallback = pinCardEdge(card, pin);
    dx = fallback === "left" ? -1 : fallback === "right" ? 1 : 0;
    dy = fallback === "top" ? -1 : fallback === "bottom" ? 1 : 0;
    dist = 1;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const size = Math.min(max, dist);
  if (size < 1) return { edge: "top", size: 0, left: nearest.x, top: nearest.y, leader: null };
  // A 1px tuck into the border, applied below, must still leave the tip inside 8px.
  const attachedGap = dist - size;
  const tipGap = attachedGap <= 7 ? attachedGap : 6;
  const tipX = pin.x - ux * tipGap;
  const tipY = pin.y - uy * tipGap;
  const edge: PinEdge = Math.abs(ux) >= Math.abs(uy) ? (ux >= 0 ? "right" : "left") : (uy >= 0 ? "bottom" : "top");
  let left = edge === "left" ? tipX : edge === "right" ? tipX - size : tipX - size / 2;
  let top = edge === "top" ? tipY : edge === "bottom" ? tipY - size : tipY - size / 2;
  const base = caretBase(edge, left, top, size);
  const flush = gap({ left: card.left, top: card.top, w: card.w, h: card.h }, { id: "", x: base.x, y: base.y }) <= 2;
  if (flush) {
    if (edge === "right") left -= 1;
    else if (edge === "left") left += 1;
    else if (edge === "bottom") top -= 1;
    else top += 1;
  }
  const tucked = caretBase(edge, left, top, size);
  const leader =
    gap(card, { id: "", x: tucked.x, y: tucked.y }) > 3
      ? { x1: nearest.x, y1: nearest.y, x2: tucked.x, y2: tucked.y }
      : null;
  return { edge, size, left, top, leader };
}

function nearestBorder(card: CardRect, pin: { x: number; y: number }): { x: number; y: number } {
  const right = card.left + card.w;
  const bottom = card.top + card.h;
  const inside = pin.x > card.left && pin.x < right && pin.y > card.top && pin.y < bottom;
  if (!inside) {
    return { x: Math.min(Math.max(pin.x, card.left), right), y: Math.min(Math.max(pin.y, card.top), bottom) };
  }
  const options = [
    { x: card.left, y: pin.y, d: pin.x - card.left },
    { x: right, y: pin.y, d: right - pin.x },
    { x: pin.x, y: card.top, d: pin.y - card.top },
    { x: pin.x, y: bottom, d: bottom - pin.y },
  ];
  options.sort((a, b) => a.d - b.d);
  return options[0];
}

function caretBase(edge: PinEdge, left: number, top: number, size: number): { x: number; y: number } {
  if (edge === "left") return { x: left + size, y: top + size / 2 };
  if (edge === "right") return { x: left, y: top + size / 2 };
  if (edge === "top") return { x: left + size / 2, y: top + size };
  return { x: left + size / 2, y: top };
}

