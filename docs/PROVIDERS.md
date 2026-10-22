# Providers

Each vendor sits behind `src/lib/providers/<capability>/`. The app calls the resolver in `index.ts`. Swap a vendor by changing the env var, not the call sites. Contract tests run the local adapter and do not hit the network.

An unknown `*_PROVIDER` value throws at resolve time. The error names the variable and the allowed values (`Unknown DB_PROVIDER "postgress". Expected postgres|pglite|neon.`). There is no silent fallback. An unset variable still uses the default below.

## db

Interface: `Sql` in `providers/db/types.ts` (tagged template and `.query()`).

Adapters: `postgres.ts` (the only `pg` import) and `pglite.ts` (the only PGLite import). `pglite-dialect.ts` is the Better Auth dialect for the embedded database. `src/lib/db.ts` does not import those modules. `providers/db/index.ts` is the registry: it picks one adapter and re-exports `openEmbeddedDb`, `sharedPgPool`, and `embeddedAuthDatabase`.

Env: `DB_PROVIDER=postgres|pglite`. `neon` is a legacy alias of `postgres`. Unset follows `DATABASE_URL` (`postgres` when it is set, otherwise `pglite`). `DB_PROVIDER=postgres` or `neon` with no `DATABASE_URL` throws `DB_PROVIDER=postgres requires DATABASE_URL.` It does not fall back to PGLite.

`getSql()` and `dbSource` stay on `src/lib/db.ts` and delegate to the registry.

Neon pooler detection is an optional hint in `providers/db/neon-pooler.ts`. Migrate uses it to pick a transaction lock on a `-pooler` host.

Production without `DATABASE_URL` and without `LOOKTAG_ALLOW_EPHEMERAL_DB=1` (or `ALLOW_EPHEMERAL_DB=1`) exits the process when the server boots. `server/plugins/refuse-ephemeral.ts` imports `providers/db/refuse-ephemeral.ts` so Nitro evaluates that guard before listen, not on the first request. CI production builds set `LOOKTAG_ALLOW_EPHEMERAL_DB=1`.

## storage

Interface: `put`, `get`, `delete`, `publicUrl`. Not wired to photo upload.

Adapters: `local.ts` (`.data/storage`) and `s3.ts` (S3-compatible, including R2 via `S3_ENDPOINT`). The AWS SDK loads only when `s3` or `r2` is selected.

Env: `STORAGE_PROVIDER=local|s3|r2` (default `local`). `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` (default `looktag-photos`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL`.

## errors

Interface: `captureException`, `captureMessage`, `setUser`.

Adapters: `console.ts` (default) and `sentry.ts` (`@sentry/node` on the server, `@sentry/react` in the browser). The Sentry SDK loads only when selected. Use an EU ingest DSN when `SENTRY_REGION=eu`.

Env: `ERROR_PROVIDER=console|sentry|none` (default `console`). `SENTRY_DSN`. `SENTRY_REGION`.

The route error screen and the server catch sites call this reporter.

## telemetry

`@opentelemetry/*` is imported only from `providers/telemetry/otlp.ts`. The OTLP HTTP POST lives in `postOtlp` in that file. `src/lib/observability/store.server.ts` calls `postOtlp`; it does not call `fetch` itself.

Env: `TELEMETRY_PROVIDER=otlp|none` (default `otlp`). Deployment environment is `APP_ENV`, then `VERCEL_ENV`, then `NODE_ENV`.

## ai

Interface: `describeImage()`, `searchProducts()`.

Adapters: `xai.ts` and `stub.ts`. The stub is deterministic and makes no network call. `process.env.XAI_API_KEY` is read only in `providers/ai/xai.ts` (`readXaiApiKey`). Suggest calls that helper.

Env: `AI_PROVIDER=xai|stub`. Unset is `xai` when a key is present, otherwise `stub`. `XAI_API_KEY`.

## shop-search

Interface: `search(query, region, domains)` and `searchEngine(engine, ...)`.

Adapters: `brave.ts`, `google-cse.ts`, and `duckduckgo.ts` (the HTML results fetch). Suggest picks Brave, Google, or DuckDuckGo through `searchEngine`. It does not import the adapters.

Env: `SHOP_SEARCH_PROVIDER=brave|google-cse|duckduckgo` (default `brave`). `google` is an alias of `google-cse`. There is no separate `SUGGEST_PROVIDER`; shop search is the suggest vendor. Per-request keys still come from catalog settings.

## auth

`providers/auth/social.ts` returns the Google and Apple credential block. `providers/auth/password.ts` is the only `better-auth/crypto` import (`hashPassword`, `verifyPassword`). App account and bootstrap code call that adapter.

Better Auth stays the framework. There is no `AUTH_PROVIDER` switch. Its other imports are confined to:

- `src/lib/auth/server.ts`
- `src/lib/auth/gate-session.server.ts`
- `src/lib/auth/method-gate.ts`
- `src/lib/auth/client.ts`

Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER`.

## email

Interface: `send({ to, subject, html, text })`.

Adapter: `console.ts` only. Not wired to any flow.

Env: `EMAIL_PROVIDER=console` (default `console`).

## Boundary check

`scripts/check-provider-imports.mjs` rejects vendor imports outside `src/lib/providers/**`. That includes `pg`, PGLite, the AWS SDK, Sentry, OpenTelemetry, `kysely`, `duckduckgo.com`, and `better-auth` / `@better-auth` outside the four auth files above. CI runs it in the unit job, after `tsc` and before the unit tests. `src/lib/providers/**/*.test.ts` is quoted in the `test` script so the shell does not expand the glob.
