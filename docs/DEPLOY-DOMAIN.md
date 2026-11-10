# Moving Looktag to thelooktag.com

The brand stays **Looktag**; `thelooktag.com` is only the address. All of it
is env-driven — nothing in `src/` names a host or a hosting provider.

## Env on the host

| Variable | Value |
| --- | --- |
| `APP_URL` | `https://thelooktag.com` |
| `BETTER_AUTH_URL` | `https://thelooktag.com` |
| `TRUSTED_ORIGINS` | `https://looktag.onrender.com` (old host keeps signing in; drop it later) |
| `CONTACT_EMAIL` | `hello@thelooktag.com` |
| `FOOTER_LINKS_ENABLED` | *(empty)* — every footer link off at launch |
| `SITE_REDIRECT_TO_CANONICAL` | Set to `1` on Render after the bandwidth change merges. Until then the old host still serves the site. |

Sign-in origin check: Better Auth trusts `BETTER_AUTH_URL`, `APP_URL`,
every `TRUSTED_ORIGINS` entry and the local dev origins. Before this change it
trusted only `BETTER_AUTH_URL`, which is why email sign-in on the new domain
returned `403 INVALID_ORIGIN` while `BETTER_AUTH_URL` still held the old host.

Session cookies are `__Host-` (no `Domain`), so a session on one host never
reaches the other: signing in on the old host does not sign you in on
thelooktag.com and vice versa.

## Google OAuth (Google Cloud console → Credentials → OAuth client)

Authorized redirect URIs:

- `https://thelooktag.com/api/auth/callback/google` (new)
- `https://looktag.onrender.com/api/auth/callback/google` (keep while the old host is in `TRUSTED_ORIGINS`)

Authorized JavaScript origins: `https://thelooktag.com` (and the old origin while transitional).
Google sign-in is off in Studio on production; after the switch, turn it on in
staging and confirm the `redirect_uri` host is `thelooktag.com`.

## DNS

`A @` → the host's apex IP and `CNAME www` → the host's service name. The host
serves TLS for both names and 301s `www` to the apex. Mail is Zoho
(MX / SPF / DKIM) — do not touch those records.

## Canonical redirect

`SITE_REDIRECT_TO_CANONICAL=1` 301s any non-`APP_URL` host (including `looktag.onrender.com`) to `https://thelooktag.com`, keeping the path and query. The owner sets that variable on the Render service **after this change is merged**. It is not set in production yet, so merging alone does not start the redirect.

While it is on:

- `localhost`, `127.0.0.1` and the canonical host are never redirected.
- Every `/api/*` path stays on the host that was asked, so `/api/version`, `/api/auth/ok` and auth callbacks keep working. Render's health check succeeds on a `2xx` or `3xx` (see Render's health check docs). A check aimed at `/api/auth/ok` or `/api/version` stays `200`. A check aimed at `/` on the old host is a `301`, which Render still counts as healthy.
- Auth routes on a `TRUSTED_ORIGINS` host are also exempt.

## Plain HTTP (F4)

Rechecked 2026-11-10: `curl -I http://thelooktag.com/` is `301` to `https://thelooktag.com/` from Cloudflare (`Server: cloudflare`), and `http://looktag.onrender.com/` is `301` to `https://looktag.onrender.com/`. HTTPS on both hosts is `200` from the app (`x-render-origin-server: Render`). The earlier `500` (`Server: Pingora`, empty body, 2026-10-31) was the host edge, not this app, and it is not the response anymore.

The app still never sees a plain-HTTP request for these hosts: TLS and the HTTP→HTTPS redirect both end at the edge. Nothing in the app special-cases the host. The Node server answers `http://` locally without error.

The app sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses whenever `APP_URL` is `https://…`.

## Health check

Unchanged: `GET /api/auth/ok` → `{"ok":true}`. `/healthz` is not part of this
change; keep any health check path from the self-hosting PR (#181) as it is.
