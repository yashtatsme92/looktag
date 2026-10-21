# Providers

Each vendor sits behind `src/lib/providers/<capability>/`. The app calls the resolver in `index.ts`. Swap a vendor by changing the env var, not the call sites. Contract tests run the local adapter and do not hit the network.

## db

Interface: `Sql` in `providers/db/types.ts` (tagged template and `.query()`).

Adapters: `postgres.ts` (the only `pg` import) and `pglite.ts` (the only PGLite import). `pglite-dialect.ts` is the Better Auth dialect for the embedded database.

Env: `DB_PROVIDER=postgres|pglite`. `neon` is a legacy alias of `postgres`. Default is `postgres` when `DATABASE_URL` is set, otherwise `pglite`.

`getSql()` and `dbSource` stay on `src/lib/db.ts` and delegate to those adapters.

Neon pooler detection is an optional hint in `providers/db/neon-pooler.ts`. Migrate uses it to pick a transaction lock on a `-pooler` host.

Production without `DATABASE_URL` and without `LOOKTAG_ALLOW_EPHEMERAL_DB=1` (or `ALLOW_EPHEMERAL_DB=1`) exits at startup instead of serving 500s from an in-memory database.

## storage

Interface: `put`, `get`, `delete`, `publicUrl`. Not wired to photo upload.

Adapters: `local.ts` (`.data/storage`) and `s3.ts` (S3-compatible, including R2 via `S3_ENDPOINT`). The AWS SDK loads only when `s3` or `r2` is selected.

Env: `STORAGE_PROVIDER=local|s3|r2` (default `local`). `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` (default `looktag-photos`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL`.

## errors

Interface: `captureException`, `captureMessage`, `setUser`.

Adapters: `console.ts` (default) and `sentry.ts` (`@sentry/node` on the server, `@sentry/react` in the browser). The Sentry SDK loads only when selected. Use an EU ingest DSN when `SENTRY_REGION=eu`.

Env: `ERROR_PROVIDER=console|sentry|none`. `SENTRY_DSN`. `SENTRY_REGION`.

The route error screen and the server catch sites call this reporter.

## telemetry

`@opentelemetry/*` is imported only from `providers/telemetry/otlp.ts`.

Env: `TELEMETRY_PROVIDER=otlp|none` (default `otlp`). Deployment environment is `APP_ENV`, then `VERCEL_ENV`, then `NODE_ENV`.

## ai

Interface: `describeImage()`, `searchProducts()`.

Adapters: `xai.ts` and `stub.ts`. The stub is deterministic and makes no network call. With no `XAI_API_KEY`, the product still reports AI as unavailable.

Env: `AI_PROVIDER=xai|stub`. `XAI_API_KEY`.

## shop-search

Interface: `search(query, region, domains)`.

Adapters: `brave.ts` and `google-cse.ts`. Admin can still pick an engine per request; that call goes straight to the matching adapter. DuckDuckGo stays in the app as a fallback and is not a provider.

Env: `SHOP_SEARCH_PROVIDER=brave|google-cse` (default `brave`) for the resolver. Per-request keys still come from catalog settings.

## auth

`providers/auth/social.ts` returns the Google and Apple credential block. Better Auth stays the framework. `src/lib/auth/server.ts` only calls this helper.

Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER`.

## email

Interface: `send({ to, subject, html, text })`.

Adapter: `console.ts` only. Not wired to any flow.

Env: `EMAIL_PROVIDER=console`.

## How to swap

1. Set the capability's `*_PROVIDER` env var.
2. Set that adapter's credentials.
3. Restart the server. Do not import the vendor SDK from app code. ESLint `no-restricted-imports` and `scripts/check-provider-imports.test.mjs` reject that.
