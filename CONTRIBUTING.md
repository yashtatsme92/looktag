# Contributing to Looktag

## Local development

```sh
npm install
sh scripts/dev.sh
```

Useful variants:

```sh
sh scripts/dev.sh --check       # status only
sh scripts/dev.sh --background  # start and return
```

Unset `DATABASE_URL` uses embedded PGLite. Set `DATABASE_URL` for real Postgres;
`scripts/dev.sh` runs migrations first.

Optional local env: copy `.env.example` to a private `.env` (never commit it) or
export variables in your shell. Deploy hosts should inject secrets directly.

## Checks

```sh
npm test            # unit + script tests
npm run test:e2e    # Playwright journey (app must be running)
npm run typecheck
npm run check:auth
```

Point e2e at a running app:

```sh
sh scripts/dev.sh --background
npm run test:e2e
```

## Admin bootstrap for local / e2e

Admin is **not** seeded with a default password. For Studio / admin e2e flows:

```sh
export ADMIN_BOOTSTRAP_PASSWORD='choose-a-local-secret'
# optional override (defaults to admin@looktag.studio)
export ADMIN_EMAIL='admin@looktag.studio'
# required when NODE_ENV=production
# export ADMIN_BOOTSTRAP=1
sh scripts/dev.sh --background
npm run test:e2e
```

`tests/e2e/helpers.mjs` reads `ADMIN_BOOTSTRAP_PASSWORD` / `ADMIN_EMAIL` — it
does not embed a password. After first bootstrap, unset the bootstrap vars and
change the admin password (Better Auth email/password `changePassword`).

## Production hardening

See the production checklist in `README.md` (auth secrets, admin bootstrap,
preview OAuth fallback, rotation of legacy `admin@looktag.studio` credentials).
