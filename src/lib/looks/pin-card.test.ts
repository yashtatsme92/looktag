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

