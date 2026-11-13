import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placePinCard, nudgeCardForPointer, pinCardPointer, pinPointerTip, type PinPoint } from "./pin-card.ts";

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

/** Pin positions of the seed look (Sunday Coat) as the plate renders them, in percent of the plate. */
const SEED_PHONE: Array<[number, number]> = [
  [47.1, 38],
  [50, 26],
  [84.6, 52],
  [47.1, 88],
];
const SEED_TABLET: Array<[number, number]> = [
  [48, 41.4],
  [50, 27.1],
  [74, 58.1],
  [48, 100.9],
];

describe("pin card placement on the seed look", () => {
  const cases: Array<{ name: string; plate: { w: number; h: number }; points: Array<[number, number]>; wide: boolean }> = [
    { name: "phone 390x844", plate: { w: 390, h: 844 }, points: SEED_PHONE, wide: false },
    { name: "phone 390x772 (plate above the tab bar)", plate: { w: 390, h: 772 }, points: SEED_PHONE, wide: false },
    { name: "tablet 834x1052", plate: { w: 834, h: 1052 }, points: SEED_TABLET, wide: true },
  ];
  for (const c of cases) {
    for (const cardH of [150, 176, 210]) {
      it(`never covers the selected pin, ${c.name}, card ${cardH}px high`, () => {
        const pins = pct(c.plate, c.points);
        for (const pin of pins) {
          const placed = placePinCard({
            pins,
            selectedId: pin.id,
            plate: c.plate,
            card: { w: c.wide ? 360 : c.plate.w - 32, h: cardH },
            inset: { top: 72, bottom: 190 },
            margin: 16,
            pinRadius: 22,
            fixedX: !c.wide,
          });
          assert.equal(placed.coversSelected, false, `selected ${pin.id}`);
          assert.ok(!placed.covered.includes(pin.id));
        }
      });
    }
  }

  it("covers no pin at all on phone 390x844 and tablet 834x1052 for any selection", () => {
    for (const c of [cases[0], cases[2]]) {
      const pins = pct(c.plate, c.points);
      for (const pin of pins) {
        const placed = placePinCard({
          pins,
          selectedId: pin.id,
          plate: c.plate,
          card: { w: c.wide ? 360 : c.plate.w - 32, h: 176 },
          inset: { top: 72, bottom: 190 },
          margin: 16,
          pinRadius: 22,
          fixedX: !c.wide,
        });
        assert.deepEqual(placed.covered, [], `${c.name} selected ${pin.id}`);
      }
    }
  });
});

describe("pin card placement when no slot is clear", () => {
  it("never covers the selected pin, even when it would be the nearest position", () => {
    // Pins every 40px over the whole plate: no clear slot exists for a 176px card.
    const pins: PinPoint[] = [];
    for (let y = 60; y < 700; y += 40) pins.push({ id: `c${y}`, x: 195, y });
    for (const pin of pins) {
      const placed = place(pins, pin.id, phone, false);
      assert.equal(placed.coversSelected, false, `selected ${pin.id}`);
    }
  });

  it("prefers sitting over the caption block to covering a pin", () => {
    // Free space exists only in the caption zone (below y 654).
    const pins: PinPoint[] = [];
    for (let y = 80; y < 600; y += 40) pins.push({ id: `c${y}`, x: 195, y });
    const placed = place(pins, pins[pins.length - 1].id, phone, false);
    assert.deepEqual(placed.covered, []);
    assert.ok(placed.top + 176 > phone.h - 190, "overlaps the caption block");
    assert.ok(placed.top + 176 <= phone.h - 16, "stays inside the plate");
  });
});

describe("tablet pin card pointer", () => {
  const plate = { w: 834, h: 1126 };
  const card = { w: 360, h: 148 };
  const limits = {
    minLeft: 16,
    maxLeft: plate.w - card.w - 16,
    minTop: 72,
    maxTop: plate.h - 16 - card.h,
  };

  it("aims a caret of at most 12px at every Sunday Coat pin", () => {
    const pins = pct(plate, [
      [48, 41.4],
      [50, 27.1],
      [74, 58.1],
      [48, 88],
    ]);
    for (const pin of pins) {
      const placed = placePinCard({
        pins,
        selectedId: pin.id,
        plate,
        card,
        inset: { top: 72, bottom: 190 },
        margin: 16,
        pinRadius: 22,
      });
      const nudged = nudgeCardForPointer(
        { left: placed.left, top: placed.top, w: card.w, h: card.h },
        pin,
        limits,
        pins.filter((other) => other.id !== pin.id),
      );
      const pointer = pinCardPointer(nudged, pin);
      const tip = pinPointerTip(pointer);
      const dist = Math.hypot(tip.x - pin.x, tip.y - pin.y);
      assert.ok(pointer.size > 0 && pointer.size <= 12, `${pin.id} size ${pointer.size}`);
      assert.ok(dist <= 8, `${pin.id} tip ${dist.toFixed(2)}px`);
      for (const other of pins) {
        const nearestX = Math.max(nudged.left, Math.min(other.x, nudged.left + nudged.w));
        const nearestY = Math.max(nudged.top, Math.min(other.y, nudged.top + nudged.h));
        const clearance = Math.hypot(other.x - nearestX, other.y - nearestY);
        assert.ok(clearance > 16, `${pin.id} halo ${other.id} ${clearance.toFixed(1)}`);
      }
    }
  });

  it("moves a corner card beside a mid-right pin", () => {
    const pin = { x: 580, y: 520 };
    const nudged = nudgeCardForPointer({ left: 16, top: 128, w: 360, h: 160 }, pin, limits, []);
    const nearestX = Math.max(nudged.left, Math.min(pin.x, nudged.left + nudged.w));
    const nearestY = Math.max(nudged.top, Math.min(pin.y, nudged.top + nudged.h));
    const clearance = Math.hypot(pin.x - nearestX, pin.y - nearestY);
    assert.ok(clearance <= 20, `gap ${clearance}`);
    const aligned = (pin.x >= nudged.left && pin.x <= nudged.left + nudged.w) || (pin.y >= nudged.top && pin.y <= nudged.top + nudged.h);
    assert.equal(aligned, true);
    const tip = pinPointerTip(pinCardPointer(nudged, pin));
    assert.ok(Math.hypot(tip.x - pin.x, tip.y - pin.y) <= 8);
  });

  it("walks the caret onto a pin the top bar keeps the card away from", () => {
    const card = { left: 180, top: 128, w: 360, h: 160 };
    const pin = { x: 320, y: 70 };
    const nudged = nudgeCardForPointer(card, pin, { ...limits, minTop: 128 }, []);
    assert.equal(nudged.top, 128);
    const pointer = pinCardPointer(nudged, pin);
    const tip = pinPointerTip(pointer);
    assert.ok(pointer.size > 0 && pointer.size <= 12);
    assert.ok(Math.hypot(tip.x - pin.x, tip.y - pin.y) <= 8, `tip ${tip.x},${tip.y}`);
    assert.ok(pointer.leader, "clamped card keeps a leader");
  });
});


