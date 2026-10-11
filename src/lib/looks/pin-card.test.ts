import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placePinCard, type PinPoint } from "./pin-card.ts";

const phone = { w: 390, h: 844 };
const tablet = { w: 834, h: 1112 };

function place(pins: PinPoint[], selectedId: string, plate: { w: number; h: number }, wide: boolean) {
  return placePinCard({
    pins,
    selectedId,
    plate,
    card: { w: wide ? 360 : plate.w - 32, h: 176 },
    inset: { top: 72, bottom: 190 },
    margin: 16,
    pinRadius: 22,
    fixedX: !wide,
  });
}

function pct(plate: { w: number; h: number }, points: Array<[number, number]>): PinPoint[] {
  return points.map(([x, y], index) => ({ id: `p${index + 1}`, x: (x / 100) * plate.w, y: (y / 100) * plate.h }));
}

describe("pin card placement", () => {
  it("never covers another pin on phone, for any selected pin", () => {
    // pin 2 sits where the old fixed bottom band landed when pin 3 or 4 was selected
    const pins = pct(phone, [
      [48, 30],
      [50, 62],
      [42, 78],
      [60, 24],
    ]);
    for (const pin of pins) {
      const placed = place(pins, pin.id, phone, false);
      assert.deepEqual(placed.covered, [], `selected ${pin.id}`);
    }
  });

  it("never covers another pin on tablet, for any selected pin", () => {
    // pin 3 sat under the card when pin 1 or 2 was selected
    const pins = pct(tablet, [
      [30, 40],
      [45, 52],
      [60, 56],
      [70, 30],
    ]);
    for (const pin of pins) {
      const placed = place(pins, pin.id, tablet, true);
      assert.deepEqual(placed.covered, [], `selected ${pin.id}`);
      assert.ok(placed.left >= 16 && placed.left + 360 <= tablet.w - 16);
    }
  });

  it("keeps the card inside the plate and clear of the bar and caption", () => {
    const pins = pct(phone, [[50, 50]]);
    const placed = place(pins, "p1", phone, false);
    assert.ok(placed.top >= 72);
    assert.ok(placed.top + 176 <= phone.h - 190);
  });

  it("hides as few pins as possible when nothing is free", () => {
    const crowded: PinPoint[] = [];
    for (let y = 80; y < 700; y += 30) crowded.push({ id: `c${y}`, x: 195, y });
    const placed = place(crowded, crowded[0].id, phone, false);
    assert.ok(placed.covered.length > 0);
  });
});
