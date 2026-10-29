# Self-hosting Looktag

Looktag ships as one OCI image, `ghcr.io/yashtatsme92/looktag`. The image reads environment variables only. It does not contain Render, Fly, Koyeb, or VM-specific code. Render Free is the primary documented target. `docker compose` with Caddy is the optional generic Docker host (`DEPLOY_TARGET=ssh-compose`).

Checked against Render's free plan docs on 29 October 2026: <https://render.com/docs/free>.

## Prerequisites

- A container host that can pull from GHCR.
- Postgres. Neon Free in Frankfurt is the documented database. Do not use Render Postgres (the free database expires after 30 days and has no backups).
- TLS. Render provides it on `https://<service>.onrender.com`. The generic host uses Caddy.
- No custom domain is required at launch.

Photos stay in Postgres in this release. The next step is object storage (`STORAGE_PROVIDER=s3` or `r2`) behind the existing storage adapter. Neon Free is 1 GB per project, so the database grows with every photo until that follow-up lands.

## 1. Database

Create a Neon project in **Frankfurt**. Copy the **pooled** connection string (the host contains `-pooler`, and the query includes `sslmode=require`) into `DATABASE_URL` on the server only. Never commit it.

Generate a signing secret and do not print it:

```sh
openssl rand -base64 32
```

Put that value in `BETTER_AUTH_SECRET` on the host. Set `BETTER_AUTH_URL` and `APP_URL` to the public `https` origin (no trailing path).

`TRUSTED_PROXY_HEADER=x-forwarded-for` when a reverse proxy appends the client address. The left-most entry is the client. Leave the variable unset when the app is reachable without that proxy — Looktag then ignores client-supplied IP headers. On the generic host, Caddy is the edge and overwrites client-supplied `X-Forwarded-*` headers.

## 2. Render Free (primary)

1. Build and push the image (see the deploy workflow, or the manual commands below).
2. In the Render Dashboard, create a **Web Service** from **Existing Image**. Image: `ghcr.io/yashtatsme92/looktag:<tag>`. If the GHCR package is private, create a Registry Credential with `read:packages` and select it. Region: **Frankfurt** (it cannot be changed later). Plan: **Free**. Health check path: `/healthz`.
3. Set environment variables in the Dashboard. Names are listed below. Values never go in git. Set `PORT=8080`, `AUTH_PROVIDER=better-auth`, `PLATFORM_CHROME=none`, `TRUSTED_PROXY_HEADER=x-forwarded-for`, and `BETTER_AUTH_URL` / `APP_URL` to `https://<service>.onrender.com`.
4. Copy the deploy hook URL into the GitHub secret `RENDER_DEPLOY_HOOK_URL`, or create `RENDER_API_KEY` and `RENDER_SERVICE_ID`. Set the repository variable `RENDER_PUBLIC_URL` to the `https://<service>.onrender.com` origin and `DEPLOY_TARGET` to `render`.
5. The first boot runs migrations under a Postgres advisory lock, then starts the server. `db:seed` is never automatic.

Seed from your machine (there is no shell and no one-off job on Render Free):

```sh
docker run --rm -e DATABASE_URL ghcr.io/yashtatsme92/looktag:<tag> node scripts/seed.mjs
```

Or run the deploy workflow with the `seed` input. That job reads `DATABASE_URL` from the GitHub environment secret by name. It does not run on a normal tag push.

### Free-tier limits (verified 29 October 2026)

Source: <https://render.com/docs/free>.

| Limit | What it means |
| --- | --- |
| 0.1 CPU and 512 MB RAM | The image sets `NODE_OPTIONS=--max-old-space-size=384`. The Postgres pool max is 5. |
| Spins down after 15 minutes without inbound traffic | The next request takes about a minute. Render shows its own loading page. Do not add a keep-alive pinger. |
| Ephemeral disk | Nothing written to the container survives a restart. |
| 750 instance hours per workspace per month | Spun-down time is not counted. One instance only. |
| No shell and no one-off jobs | Seed and backups run from outside Render. |
| Outbound SMTP ports 25, 465, and 587 are blocked | Email delivery cannot use those ports. |
| Restarts at any time | Migrations are idempotent and locked. |
| Rollback keeps only the two previous deploys | See Rollback below. |
| While spun down, `/robots.txt` is replaced | Render answers `disallow all` until the instance is awake. |

Neon Free also scales to zero after about 5 minutes idle, so the first request after idle can pay both cold starts.

`/healthz` returns 503 when required configuration is missing, so Render keeps the previous healthy deploy instead of promoting a broken one.

### Custom domain later

Render custom domains with managed TLS work on Free. Point DNS at Render, change `BETTER_AUTH_URL` and `APP_URL`, update the Google redirect URI, and redeploy. No image change.

## 3. Generic Docker host

Point DNS `A`/`AAAA` at the host. Firewall only 22, 80, and 443. Put the same variable names in a private `.env` (see `.env.production.example`). Set `APP_DOMAIN` to the hostname Caddy should obtain a certificate for.

```sh
docker compose pull
docker compose up -d
docker compose run --rm app node scripts/seed.mjs
```

Migrations run on container start. Seed is a one-off and is idempotent (`on conflict do nothing`).

An optional Compose profile `db` starts Postgres 16 with a named volume for people who are not using Neon. Neon is the default. Do not start that profile in production unless you operate the backups yourself.

## 4. Admin, Google, and Apple

Bootstrap the admin once, then remove the password from the environment and rotate it after the first sign-in:

```sh
ADMIN_EMAIL=admin@looktag.studio
ADMIN_BOOTSTRAP=1
ADMIN_BOOTSTRAP_PASSWORD=<generate a value, do not commit it>
```

Google is the social provider at launch. Apple is supported by the adapter and stays off until you set its variables.

Create a Google OAuth client (Web application). Authorized redirect URI:

- `https://<service>.onrender.com/api/auth/callback/google`
- or `https://<APP_DOMAIN>/api/auth/callback/google` on the generic host

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Turn the Google method on in Studio if it is not already. The login page only shows Google when both the credentials and the Studio toggle are on.

Apple, later: redirect `https://<host>/api/auth/callback/apple`, and set `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, and optionally `APPLE_APP_BUNDLE_IDENTIFIER`.

Cookies are `__Host-looktag.*` (Secure, Path=/, no Domain). Plain HTTP other than loopback will not keep a session. Render and Caddy both terminate TLS.

## 5. Backups, rollback, upgrade

**Backups.** Use Neon point-in-time restore. Also schedule `pg_dump` from a machine that is not the web instance, and store the dump off-box. Run a restore drill onto an empty database before you need it. Render Free has no persistent disk, so a dump must not stay on the instance.

**Rollback.** Migrations are forward-only. See `docs/DATABASE.md` for the expand/contract policy: ship a compatible schema first, deploy the code, then drop the old shape in a later migration. There is no down migration.

- Render: redeploy the previous tag with the deploy hook (`imgURL` set to that tag) or the Dashboard rollback. Free keeps only the two most recent previous deploys.
- Generic host: pin `LOOKTAG_IMAGE` to the previous tag and run `docker compose up -d`.

**Upgrade.** Push a `vX.Y.Z` tag (or run the deploy workflow). The workflow builds `linux/amd64` and `linux/arm64`, pushes `ghcr.io/yashtatsme92/looktag:<tag>` and `:sha-<short>`, then deploys that exact tag. Manual equivalent:

```sh
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/yashtatsme92/looktag:<tag> --push .
# Render: POST the deploy hook with imgURL set to that image. Do not print the hook URL.
# Generic host:
LOOKTAG_IMAGE=ghcr.io/yashtatsme92/looktag:<tag> docker compose pull
LOOKTAG_IMAGE=ghcr.io/yashtatsme92/looktag:<tag> docker compose up -d --wait
```

## 6. Troubleshooting

| Symptom | What to check |
| --- | --- |
| `INVALID_ORIGIN` | `BETTER_AUTH_URL` must be the origin the browser uses, including `https`. |
| Configuration error page | The page lists variable names only. Compare it with the table below. `/healthz` is 503 until they are set. Production never opens in-memory PGLite unless `LOOKTAG_ALLOW_EPHEMERAL_DB=1`. |
| Session cookie does not stick | The site is not HTTPS (and not loopback). `__Host-` cookies require Secure. |
| Render loading page for about a minute | The free instance was spun down. This is expected. Do not ping it to keep it warm. |
| 502 from Caddy | The `app` service is not healthy. `docker compose logs app` and `/healthz`. |
| Slow first request | Neon Free scaled to zero (about 5 minutes idle) and Render may be cold too. |

## 7. Environment variables

| Name | Required | Default | Adapter |
| --- | --- | --- | --- |
| `DATABASE_URL` | required in production | unset (PGLite outside production; refused in production) | db |
| `DATABASE_SSL_NO_VERIFY` | optional | unset (certificates are verified) | db |
| `DB_PROVIDER` | optional | postgres when DATABASE_URL is set, else pglite | db |
| `LOOKTAG_ALLOW_EPHEMERAL_DB` | optional | unset | db |
| `ALLOW_EPHEMERAL_DB` | optional alias | unset | db |
| `BETTER_AUTH_SECRET` | required in production | in-process preview secret outside production | auth |
| `BETTER_AUTH_URL` | required in production; https, or http on loopback | dynamic host outside production | auth |
| `APP_URL` | required in production; https, or http on loopback | request origin for some links | app |
| `AUTH_PROVIDER` | optional | better-auth | auth |
| `AUTH_COOKIE_PREFIX` | optional | looktag (grok-auth when AUTH_PROVIDER=grok) | auth |
| `TRUSTED_PROXY_HEADER` | optional | unset (client IP headers are not trusted) | auth |
| `PLATFORM_CHROME` | optional | none, or grok when AUTH_PROVIDER=grok or a Grok sandbox host | chrome |
| `GOOGLE_CLIENT_ID` | optional | unset | auth |
| `GOOGLE_CLIENT_SECRET` | optional | unset | auth |
| `APPLE_CLIENT_ID` | optional | unset | auth |
| `APPLE_CLIENT_SECRET` | optional | unset | auth |
| `APPLE_APP_BUNDLE_IDENTIFIER` | optional | unset | auth |
| `GROK_AUTH_ISSUER` | optional, grok adapter | https://auth.grok.me | auth |
| `GROK_AUTH_CLIENT_ID` | required when AUTH_PROVIDER=grok | unset | auth |
| `GROK_AUTH_CLIENT_SECRET` | required when AUTH_PROVIDER=grok | unset | auth |
| `GROK_PREVIEW_CLIENT_ID` | optional, grok adapter only | unset | auth |
| `GROK_PREVIEW_CLIENT_SECRET` | optional, grok adapter only | unset | auth |
| `GROK_CONNECTORS_URL` | optional | unset (app data reports not configured) | app-data |
| `GROK_CONNECTOR_ACCESS_TOKEN` | optional, non-production | unset | app-data |
| `GROK_GATE_ORIGIN` | optional, grok adapter | unset | auth |
| `GROK_PROJECT_ID` | optional, grok adapter | unset | auth |
| `ADMIN_EMAIL` | optional | admin@looktag.studio | auth |
| `ADMIN_BOOTSTRAP` | optional | unset (required with the password in production) | auth |
| `ADMIN_BOOTSTRAP_PASSWORD` | optional | unset | auth |
| `AI_PROVIDER` | optional | xai when XAI_API_KEY is set, else stub | ai |
| `XAI_API_KEY` | optional | unset | ai |
| `SHOP_SEARCH_PROVIDER` | optional | brave | shop-search |
| `BRAVE_API_KEY` | optional | unset | shop-search |
| `GOOGLE_API_KEY` | optional | unset | shop-search |
| `GOOGLE_CX` | optional | unset | shop-search |
| `STORAGE_PROVIDER` | optional | local | storage |
| `STORAGE_LOCAL_ROOT` | optional | .data/storage | storage |
| `STORAGE_PUBLIC_BASE_URL` | optional | unset | storage |
| `S3_ENDPOINT` | required when STORAGE_PROVIDER=r2 | unset | storage |
| `S3_REGION` | required when STORAGE_PROVIDER is s3 or r2 | unset | storage |
| `S3_BUCKET` | required when STORAGE_PROVIDER is s3 or r2 | looktag-photos | storage |
| `S3_ACCESS_KEY_ID` | required when STORAGE_PROVIDER is s3 or r2 | unset | storage |
| `S3_SECRET_ACCESS_KEY` | required when STORAGE_PROVIDER is s3 or r2 | unset | storage |
| `ERROR_PROVIDER` | optional | console | errors |
| `SENTRY_DSN` | optional | unset | errors |
| `SENTRY_REGION` | optional | unset | errors |
| `TELEMETRY_PROVIDER` | optional | otlp | telemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | unset | telemetry |
| `EMAIL_PROVIDER` | optional | console | email |
| `SUGGEST_PROVIDER` | optional | shop-search | suggest |
| `APP_ENV` | optional | VERCEL_ENV, then NODE_ENV | telemetry |
| `NITRO_PRESET` | optional, build | node-server (vercel if VERCEL is set) | build |
| `HOST` | optional | 0.0.0.0 in the image | runtime |
| `PORT` | optional | 8080 | runtime |
| `MIGRATE_ON_START` | optional | 1 | runtime |
| `NODE_OPTIONS` | optional | --max-old-space-size=384 in the image | runtime |
| `LOOKTAG_IMAGE` | optional, generic host | ghcr.io/yashtatsme92/looktag:latest | deploy |
| `APP_DOMAIN` | optional, generic host only | unset | deploy |
| `DEPLOY_TARGET` | CI only | render | deploy |
| `LOOKTAG_NATIVE_URL` | optional | unset | native |
| `VITE_AUTH_ENABLED` | optional | true | auth |
| `VITE_APP_URL` | optional | unset | app |
| `VITE_PUBLIC_HOSTNAME` | optional | unset | chrome |
| `PUBLIC_ORIGIN` | optional | unset | app |
| `LOOKTAG_GIT_SHA` | optional | package version | runtime |
| `LOOKTAG_BUNDLE_PGLITE` | optional, build | 0 inside the Docker build | build |
| `LOOKTAG_SKIP_BUILD_MIGRATE` | optional, build | 1 inside the Docker build | build |
| `LOOKTAG_LOG_NITRO_PRESET` | optional | unset (logged automatically when npm runs build) | build |

`startup.sh`, `scripts/dev.sh`, and `.grok/` are Grok-sandbox dev tooling. They are not part of this image and not required to self-host.
