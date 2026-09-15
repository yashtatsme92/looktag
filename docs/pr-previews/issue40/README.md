# Issue #40 — Creators rail on phone For you

Live Playwright captures from local `vite dev` on branch `phase1/b-creators-rail-foryou` (browse coach dismissed).

SVG companions embed JPEG captures for reliable GitHub preview. Schematic companions included if binary embeds fail.

## Phone For you

| Before (`main`) | After |
| --- | --- |
| ![before phone For you](./before-phone-foryou.svg) | ![after phone For you](./after-phone-foryou.svg) |

Schematic:

| Before | After |
| --- | --- |
| ![before schematic](./before-phone-foryou-schematic.svg) | ![after schematic](./after-phone-foryou-schematic.svg) |

## Expected

| Surface | Behavior |
| --- | --- |
| Phone For you | Creators avatar rail visible when creators exist |
| Phone Creators | Rail unchanged (still visible) |
| Mood / Saved / All | Rail hidden |
| Desktop ≥768px | Rail hidden (CSS) |
| Avatar tap | Filter → Creators + focus that creator |
| Empty For you | Title once; body does not repeat “Nothing here yet” |
