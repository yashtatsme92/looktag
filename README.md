# Looktag

A shoppable fashion app. Photograph a look, pin each piece, and send people to
live product pages. Houses is the labels section — independent collections,
liking-based discovery, and a **Scouted** mark for houses Looktag picks.

The phone is the canvas (390×844) with native chrome. **Tablet and desktop are
a real website** — sticky masthead, portrait lookbook grid, plate-sized look
photos. The phone tab bar never appears on a wide screen, and looks never
stretch edge to edge. Shareable `/looks/:id`, `/houses/:id`, and collection
links work for anonymous traffic on any screen.

## Quick start

```sh
npm install
sh scripts/dev.sh
```

That script prints which database and integrations are live, applies migrations
when Postgres is configured, and starts the app. Contributor details:
[`CONTRIBUTING.md`](CONTRIBUTING.md).

```sh
sh scripts/dev.sh --check       # status only
sh scripts/dev.sh --background  # start and return
```

`startup.sh` calls the background form after a revive.

## Stack

| Layer | Choice |
| --- | --- |
| App | TanStack Start, React 19, Vite, Tailwind v4 |
| State | Zustand |
| Database | Postgres — Neon when `DATABASE_URL` is set, otherwise embedded PGLite |
| Auth | Better Auth (email, Google, X) — toggled from Studio |
| Search | Grok, DuckDuckGo, Brave, or Google Programmable Search |
| Native | PWA + Capacitor shell (`app.looktag.studio`) |

## Database

Schema lives in [`migrations/`](migrations/). Files apply in name order, once,
recorded in `_migrations`.

| File | What it adds |
| --- | --- |
| `0001_auth.sql` | Better Auth tables |
| `0002_looks.sql` | Looks, pins, offers |
| `0003_observability.sql` | Signals |
| `0004_studio.sql` | `looktag_settings`, `fashion_labels` |
| `0005_studio_config.sql` | `extras_json` on settings |
| `0006_collections.sql` | Named collections on houses |
| `0007_houses_admin.sql` | House owner + approval status |

**No `DATABASE_URL`.** The app uses PGLite (Postgres compiled to WASM).
Migrations run on first query. Fine for local work and the live preview.

**With `DATABASE_URL`.** Any Postgres (Neon, RDS, local). `scripts/dev.sh`
runs `npm run db:migrate` before the server. The same command runs at the end
of `npm run build`.

Prefer host-injected secrets in deploy. For local reference, copy
[`.env.example`](.env.example) to a private `.env` that is **never committed**.
`DATABASE_URL` in the environment is enough to switch backends — no code change.

## Configuration

Two layers. Registry: [`src/lib/config.ts`](src/lib/config.ts).

### Environment

| Variable | Role | Required for deploy | If unset |
| --- | --- | --- | --- |
| `DATABASE_URL` | Postgres | Recommended for production data | Embedded PGLite |
| `BETTER_AUTH_SECRET` | Better Auth signing secret | **Yes** | Ephemeral preview secret (sessions reset on restart) |
| `BETTER_AUTH_URL` | Public auth origin (OAuth / CSRF) | **Yes** | Dynamic preview host / localhost |
| `GROK_AUTH_ISSUER` | Grok auth broker issuer | Recommended | `https://auth.grok.me` |
| `GROK_AUTH_CLIENT_ID` | Per-app broker client id | **Yes** outside sandbox | Shared preview client |
| `GROK_AUTH_CLIENT_SECRET` | Per-app broker client secret | **Yes** outside sandbox | Shared preview client |
| `ADMIN_EMAIL` | Admin mailbox for bootstrap / checks | Optional | `admin@looktag.studio` |
| `ADMIN_BOOTSTRAP_PASSWORD` | One-time admin bootstrap password | Only when bootstrapping | No admin user is seeded |
| `ADMIN_BOOTSTRAP` | Explicit bootstrap flag | **Required with password in production** | Bootstrap disabled in production |
| `XAI_API_KEY` | Grok shop search and look suggestions | Optional | Engines that do not need a key |
| `APP_URL` | Public origin for share links | Recommended | Request origin |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Traces / metrics / logs | Optional | Signals page only |
| `LOOKTAG_NATIVE_URL` | Hosted origin for the Capacitor shell | Optional | Local `public/` |
| `VITE_AUTH_ENABLED` | Account sign-in (via `.grok/app-env.json`) | Optional | `true` |

Shop API keys (Brave, Google cx) stay on the device in Catalog — they are not
written to the database.

### Admin bootstrap (secure)

System settings are on `/admin`, not on You. There is **no default admin
password** in source. Provision once with env:

```sh
export ADMIN_EMAIL='admin@looktag.studio'          # optional override
export ADMIN_BOOTSTRAP_PASSWORD='a-long-random-secret'
export ADMIN_BOOTSTRAP=1                           # required when NODE_ENV=production
```

On server start, `ensureAdminUser` inserts that credential user **only when**
those env rules pass. Public handlers (`getAppSettings`, root session fetch)
never create admin users.

After first successful bootstrap:

1. Unset `ADMIN_BOOTSTRAP` and `ADMIN_BOOTSTRAP_PASSWORD` from the runtime env.
2. Sign in and change the password via Better Auth email/password
   (`changePassword`) — keep using a password manager.
3. Confirm `/admin` still works with the new password.

Local / e2e notes: [`CONTRIBUTING.md`](CONTRIBUTING.md).

### Production hardening checklist

- [ ] Set a strong unique `BETTER_AUTH_SECRET` (do not reuse preview/ephemeral).
- [ ] Set `BETTER_AUTH_URL` to the public HTTPS origin.
- [ ] Inject per-app `GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET` (do not
      rely on the shared preview OAuth client outside `*.grok-sandbox.com`).
- [ ] Bootstrap admin once with `ADMIN_BOOTSTRAP=1` +
      `ADMIN_BOOTSTRAP_PASSWORD`, then **remove** those vars.
- [ ] Rotate any legacy `admin@looktag.studio` credential that may still use the
      old published password (see migration below).
- [ ] Keep `VITE_AUTH_ENABLED` appropriate for the environment; fail closed when
      `DATABASE_URL` is set.

### Migrating / rotating already-seeded admin accounts

Older builds auto-seeded `admin@looktag.studio` with a known password. On every
existing database:

1. **Preferred:** sign in as admin (if you still can) and change the password
   immediately, then revoke other sessions.
2. **Invalidate credential login** (forces a fresh bootstrap with a new secret):

```sql
-- Drop the password credential for the legacy admin mailbox
delete from "account"
where "providerId" = 'credential'
  and ("accountId" = 'admin@looktag.studio' or "userId" = 'admin');
```

3. Set `ADMIN_BOOTSTRAP=1`, `ADMIN_BOOTSTRAP_PASSWORD` (new secret), optional
   `ADMIN_EMAIL`, restart once so the account is re-created, then unset bootstrap
   env and change the password again.
4. Or delete the user row and re-bootstrap the same way:

```sql
delete from "session" where "userId" in (
  select id from "user" where email = 'admin@looktag.studio'
);
delete from "account" where "userId" in (
  select id from "user" where email = 'admin@looktag.studio'
);
delete from "user" where email = 'admin@looktag.studio';
```

From `/admin`: **Shops**, **Studio**, **Houses** (approve new labels), **Look**
(palettes), **Signals** (trace graph + filters).

Long shop and house lists on those pages have search, sort, pages of 8, and
**Suggested** picks ranked by awesomeness — house rank + Scouted, shop pin
volume + search priority.

Signals at `/admin/observability` shows traces as a parent–child graph (operation
map, DAG, waterfall). Admin filters (status, duration, name, span kind,
attributes) persist in `observability_settings.extras_json`. Nested server work
— look list, house looks — records child spans on the same trace.

### Studio (database)

Open **Studio** at `/admin/studio`. These knobs persist in `looktag_settings`.

| Knob | Storage | Default |
| --- | --- | --- |
| Email / Google / X sign-up | columns | all on (at least one must stay on) |
| Houses | column | on |
| Search engine + country | `extras_json` | Grok, `DE` |
| Rank scores (look / pin / compared) | `extras_json` | 12 / 3 / 5 |
| Palette (`themeId`) | `extras_json` | `ink` |

`extras_json` is a JSON bag. Add a key in `EXTRAS_KEYS` inside
[`src/lib/settings/model.ts`](src/lib/settings/model.ts) — no new migration.
Unknown keys survive a write, so older servers do not wipe newer ones.

Creators register a house at `/houses/apply`. It stays hidden until an admin
approves it on `/admin/houses`. After applying, the same page is the house
studio: edit the label, add collections, and resubmit if it was declined.

## Design system

Catalog: `/admin/look` (admin only). Palettes: Ink, Paper, Night, Snow, Stone,
Carbon, Slate, Bone, Navy, Moss. Tokens live in [`src/styles.css`](src/styles.css)
(`@theme`, `html[data-theme]`, and `ds-*` utilities). Inventory:
[`src/lib/design/system.ts`](src/lib/design/system.ts).

**Mobile titles wrap.** Screen, section, card, and native-header titles never
use ellipsis. They drop to two lines (`overflow-wrap: anywhere`,
`text-wrap: balance`). House stats are a 2×2 grid so **Compared** stays
readable. Rank scores in Studio stack so labels are not clipped.

**Desktop is a website.** From 768px up (browser, not installed PWA) the fake
phone bezel is gone. A top nav replaces the tab bar. Home is a lookbook
grid. Look permalinks use a two-column editorial layout (photo + shop).
Installed / native shells keep the phone chrome. Phone and the installed app
lock pinch-zoom; fields are 16px so iOS does not zoom the page when typing.

## Testing

```sh
npm test            # unit + script tests
npm run test:e2e    # Playwright journey, phone viewport, sequential flows
npm run test:app    # Looktag regression cases
npm run typecheck
npm run check:auth
```

The Playwright suite ([`tests/e2e/run.mjs`](tests/e2e/run.mjs)) walks the
product in order on a 390×844 phone, then again on a 1280×800 desktop:

1. Guest home, You (sign in first), Rank — titles wrap, no horizontal overflow
2. Open a look and check a live shop link
3. Houses, Scouted, house profile, register-a-house link
4. Design palettes (admin) and wrap rule
5. Studio toggles (hide Google, restore)
6. Rank weights and Houses feature flag persist in the database
7. Create studio (one page: photo, pins, name) and shop search
8. Catalog shops (admin)
9. Account: sign up, no system-config links, house application stays pending
10. Admin approves houses
11. Desktop: no device frame, top nav, lookbook, shareable look + house pages

Helpers skip the boot splash and the how-to overlay. Failures write a
screenshot to `screenshots/e2e-<flow>.png`.

Point the suite at a running app (set `ADMIN_BOOTSTRAP_PASSWORD` first — see
[`CONTRIBUTING.md`](CONTRIBUTING.md)):

```sh
export ADMIN_BOOTSTRAP_PASSWORD='your-local-secret'
sh scripts/dev.sh --background
node tests/e2e/run.mjs
```

## Scripts

| Command | What it does |
| --- | --- |
| `sh scripts/dev.sh` | Database + integrations + dev server |
| `npm run dev` | Vite via `scripts/with-app-env.mjs` |
| `npm run build` | Production build, PGLite assets, migrate |
| `npm run preview:restart` | Serve the built app on :8081 |
| `npm run db:migrate` | Apply `migrations/` to `DATABASE_URL` |
| `npm run native:sync` | Capacitor sync |
| `sh startup.sh` | Revive: start only if nothing is listening |

## Native

Install from the browser: iPhone Safari → Share → Add to Home Screen, or
Chrome → Install app. Cold start shows the fashion-plate launch.

For App Store / Play, wrap the hosted origin:

```sh
LOOKTAG_NATIVE_URL=https://your-looktag-host npx cap add ios
LOOKTAG_NATIVE_URL=https://your-looktag-host npx cap add android
npx cap sync
```

## Layout

```
migrations/          schema, applied once
scripts/dev.sh       development launcher
src/lib/config.ts    env + Studio registry
src/lib/settings/    parse, extras_json, server store
src/lib/labels/      Houses, Scouted, ranking
src/lib/looks/       looks, catalog, rank weights
src/routes/          file routes (Houses is /houses)
src/styles.css       design tokens
tests/e2e/           Playwright journey
CONTRIBUTING.md      local + test + bootstrap notes
.env.example         empty env placeholders
```
