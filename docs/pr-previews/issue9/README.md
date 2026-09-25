# Issue #9 — Guest → look → pin → shop happy path

Fixes #9.

## Happy path

| Surface | Guest | Signed-in |
| --- | --- | --- |
| Phone | Open **Create** → add photo → add/select pins → tap **Search item** to hit the sign-in gate → after account creation return to the draft, resolve live shop offers, publish, then tap **Shop** to open the retailer page in a new tab. | Open **Create** → add photo → pin pieces → resolve live shop offers → **Publish look** → from the saved look tap **Shop** (piece) or **Shop look** (cheapest per piece) to open retailer pages. |
| Desktop | Same sequence, but shopping stays in the right-hand dock and expanded cards show compare rows while **Shop** remains the primary CTA. | Same as guest after sign-in, with the sticky photo + sticky dock layout on `/looks/:id`. |

## Funnel signals

Signals spans + counters now emit under `looktag.funnel.*` for:

- `looktag.funnel.look_created`
- `looktag.funnel.pin_added`
- `looktag.funnel.shop_result_shown`
- `looktag.funnel.shop_outbound_click`

The admin Signals filters also include a **Funnel** preset (`name contains looktag.funnel`) so drop-offs can be isolated quickly.

## Known failure modes and expected UX

| Failure mode | Expected UX |
| --- | --- |
| No search key / shop search disabled | Keep the draft intact and show the existing inline error (`Turn on at least one shop...`, `Add a Brave Search API key...`, or `Add a Google API key...`). No publish or navigation side effect. |
| Empty result | Keep the pin selected and show the existing retry guidance (`No item pages... Try a more specific name...`). Shopper can rename the piece or paste a product page manually. |
| Dead offer / no valid live shop on a look | Disable/soft-block shop CTAs naturally: piece buttons fall back to **Pieces**, `Shop look` shows `No live shops on this look yet`, and the user stays on the current screen. |
