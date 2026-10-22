# LOADING-ACCEPTANCE: Looktag loading motion system

**Status: LOCKED 2026-10-13 21:25 (user).** Proposed timings (lane expand 250ms, sheet rise 250ms, Saved 1.5s + 150ms fade, upload bar no delay) accepted as part of the lock.

Frames: `/workspace/looktag-responsive-review/loading/{png,jpg}/LD01…LD08-{phone-390|tablet-834|desktop-1440}-*`
Demo: `/workspace/looktag-responsive-review/loading/demo/index.html` (self-contained) · video `demo/demo.mp4` (22.8s)
Draft ids: `resume.json → loadingMotion.frames`.

## CSS tokens (copy into the global stylesheet)

```css
:root {
  --dur-crossfade: 150ms;   /* state/page swap */
  --dur-indicator: 200ms;   /* feed tab indicator slide */
  --dur-image: 200ms;       /* image fade-in on placeholder */
  --dur-lane: 250ms;        /* Echo lane expand (motion-fast) */
  --dur-sheet: 250ms;       /* Shop sheet rise (motion-fast) */
  --dur-pulse: 1200ms;      /* skeleton opacity pulse period */
  --stagger-step: 30ms;     /* Echo tile stagger */
  --stagger-max-tiles: 8;   /* => max 240ms total offset */
  --skeleton-delay: 300ms;  /* JS: show skeleton only after this */
  --skeleton-min: 400ms;    /* JS: once shown, keep at least this */
  --load-timeout: 10000ms;  /* JS: then show the existing error state */
  --dim-loading: 0.4;       /* old content opacity while new is loading */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);   /* indicator, lane, sheet */
  --ease-std: cubic-bezier(0.4, 0, 0.2, 1);     /* opacity crossfades/fades */
  --skel: #E2E2E2;          /* skeleton block (ink grey) */
  --skel-2: #D6D6D6;        /* skeleton inner bars */
  --ph: #D4D4D4;            /* image placeholder ground */
}

@keyframes skel-pulse { 0%, 100% { opacity: .6 } 50% { opacity: 1 } }
.skeleton { background: var(--skel); animation: skel-pulse var(--dur-pulse) ease-in-out infinite; }
.fade-layer { transition: opacity var(--dur-crossfade) var(--ease-std); }
.is-loading-old { opacity: var(--dim-loading); }
.tab-indicator { transition: transform var(--dur-indicator) var(--ease-out); }
.img-slot { background: var(--ph); aspect-ratio: var(--ar, 3 / 4); overflow: hidden; }
.img-slot img { opacity: 0; transition: opacity var(--dur-image) var(--ease-std); }
.img-slot img.is-loaded { opacity: 1; }
.echo-lane { overflow: hidden; transition: height var(--dur-lane) var(--ease-out); }
.echo-tile { opacity: 0; transition: opacity var(--dur-image) var(--ease-std);
  transition-delay: calc(min(var(--i), 7) * var(--stagger-step)); }  /* set --i per tile */
.echo-tile.is-in { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  :root { --dur-crossfade: 0ms; --dur-indicator: 0ms; --dur-image: 0ms; --dur-lane: 0ms; --dur-sheet: 0ms; --stagger-step: 0ms; }
  .skeleton { animation: none; opacity: 1; }
}
```

Reference loader (the demo's `load()`): if cached → render now, no skeleton. Else dim old to 40%, start a 300ms timer; when it fires, show skeleton and note the time. On data: cancel timer; if a skeleton is showing, wait until it has been visible ≥400ms; crossfade 150ms. At 10s or on error: replace skeleton with the existing error state.

## Criteria

### Global timing
- **L1** Crossfades between states are 150ms opacity, `--ease-std`. No translate or scale on content swaps.
- **L2** Ready content is never delayed: if data resolves before 300ms, no skeleton is shown and the swap is a plain 150ms crossfade.
- **L3** Old content dims to 40% only while the new content is still loading (from tap until data or skeleton). It is not dimmed when the swap is immediate.
- **L4** Skeletons appear only after 300ms of waiting and, once shown, stay at least 400ms.
- **L5** Skeletons use no moving shimmer. Opacity pulse 0.6 → 1 → 0.6 over 1.2s, ease-in-out, ink-grey (`--skel`, `--skel-2`) only.
- **L6** Images fade in over 200ms on a `--ph` placeholder sized to the image's own aspect (3:4 for looks). Nothing shifts layout when an image or data arrives (CLS 0 for these swaps).
- **L7** Back navigation restores from cache (content and scroll) with no skeleton and no dim.
- **L8** On error, the skeleton is replaced by the screen's existing error state. Requests time out at 10s and show that same error state.
- **L9** No full-page spinners anywhere. No spinner in Create upload or Admin saves. No motion on the hero photo (no fade, zoom, parallax or shift) in any of these flows.

### Skeleton geometry
- **L10** Skeletons match the real grid: same columns, gap (12px), aspect (3:4), radius (24px tiles), and the count that fills the first viewport. Grid: phone 2 cols, tablet 2 cols, 1024–1279 3 cols (lead tile spans 2 of 3), 1280+ 4 cols.
- **L11** Skeleton tiles carry three caption bars at the tile foot (kicker, title, pieces) where the real tile has a caption.
- **L12** Skeleton offer rows match the real Shop row: 28px circle (pin slot), 56px r12 thumb, two text lines, a 44px r12 button block. No price placeholder (Look + Shop shows no prices).
- **L13** Admin skeleton rows match the real 60px row: 40px r12 mark, two lines, switch block.

### Per surface
- **L14 Feed tabs** (For you ↔ Following): the indicator slides 200ms `--ease-out` while the content crossfades 150ms. Slow network: dim 40% → skeleton tiles at 300ms → ≥400ms hold → crossfade. (LD01, LD02)
- **L15 Echo lane**: the lane expands in place under the photo (250ms, `--ease-out`). The phone keeps the 2×2 chip grid under the photo. If results take more than 300ms, skeleton tiles fill the lane grid. On data, tiles fade in with a 30ms step per tile, capped at 8 tiles (max 240ms offset); tiles 9+ use tile 8's delay. (LD03, LD04)
- **L16 Shop sheet / dock**: the header ("Shop this look", piece count) shows at once; offer rows show skeleton rows per L4/L12, then crossfade 150ms. The sheet rises in 250ms; the desktop dock is already open. (LD05)
- **L17 Houses index, profile, Line and Style grids**: skeleton tiles per L10. The profile header (mark, name, Follow) comes from the index cache and never shows as a skeleton. (LD06)
- **L18 Admin Houses on/off filter**: page swap is a 150ms crossfade.
- **L19 Create upload**: a 3px ink progress bar under the 3:4 photo slot tracks real progress from 0 (no 300ms delay; it is progress, not a skeleton). When it finishes, the bar hides (150ms) and the photo fades in over 200ms. Continue stays disabled (color only) until then. No spinner. (LD07)
- **L20 You Saved and Drafts**: skeleton tiles per L10.
- **L21 Admin lists**: skeleton rows per L13 for first load and pagination.
- **L22 Admin switches and Save**: optimistic. The control changes at once and inline muted text beside it reads "Saving…" then "Saved" (shown 1.5s, then a 150ms fade). On failure the control reverts and the existing inline error shows. No spinner, no page block. (LD08)

### Reduced motion (`prefers-reduced-motion: reduce`)
- **L23** Skeletons are static (no pulse), swaps are instant (0ms), the tab indicator jumps, the Echo lane appears at full height and its tiles appear together, the sheet appears without sliding. The skeleton timing rules (L2, L4) still apply.

### Controls and type
- **L24** All new controls follow the locked rules: 44px rounded-square controls, radius 12; primary vs ghost differ in color only; Playfair Display + Figtree; ink grey-only palette. Circles only for photo pins (pin v1) and the pin slot in skeleton rows.

### Verification
- **L25** Playwright: with a 1.6s network delay, the skeleton is in the DOM between 300ms and data+; it is not in the DOM when data resolves in under 300ms; the min hold is ≥400ms; with `reducedMotion: 'reduce'` computed `animation-name` on `.skeleton` is `none`.
