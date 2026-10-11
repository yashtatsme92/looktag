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
