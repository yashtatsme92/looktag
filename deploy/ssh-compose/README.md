# Generic Docker host

`docker-compose.yml` and `Caddyfile` at the repo root are this target. `DEPLOY_TARGET=ssh-compose` in the deploy workflow pulls the same GHCR image and runs `docker compose up -d --wait`.

See [docs/SELF_HOSTING.md](../../docs/SELF_HOSTING.md).
