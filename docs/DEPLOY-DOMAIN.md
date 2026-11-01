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
| `SITE_REDIRECT_TO_CANONICAL` | *(unset)* for now; `1` later to 301 the old host to `APP_URL` |

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

## Plain HTTP (F4)

`curl -I http://thelooktag.com/` returned `500` with `Server: Pingora` and an
empty body on all three hosts (including the old one) on 2026-10-31. That is
the host's edge, not the app: the app never sees a plain-HTTP request on this
host (TLS ends at the edge), and the Node server answers `http://` locally
without error. Fix it in the host's settings (enable the HTTP→HTTPS
redirect for the custom domains, or re-save the domains so the edge
re-provisions the redirect) and recheck with `curl -I`. No host-specific code
was added.

The app now sends `Strict-Transport-Security: max-age=31536000; includeSubDomains`
on HTTPS responses whenever `APP_URL` is `https://…`.

## Health check

Unchanged: `GET /api/auth/ok` → `{"ok":true}`. `/healthz` is not part of this
change; keep any health check path from the self-hosting PR (#181) as it is.
