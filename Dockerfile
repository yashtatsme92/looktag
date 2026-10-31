# Looktag production image. One Node server, configured only by environment.
# PGLite is not shipped. Migrations run on container start, not during build.
# Seed is a one-off: docker run --rm -e DATABASE_URL <image> node scripts/seed.mjs
#
#   docker build -t looktag .
#   docker run -p 8080:8080 \
#     -e DATABASE_URL -e BETTER_AUTH_SECRET -e BETTER_AUTH_URL -e APP_URL \
#     looktag

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && rm -rf node_modules/@electric-sql

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
ENV LOOKTAG_BUNDLE_PGLITE=0
ENV LOOKTAG_SKIP_BUILD_MIGRATE=1
RUN npm run build && node scripts/bundle-seed.mjs

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 looktag \
  && useradd --uid 10001 --gid 10001 --home-dir /tmp --shell /usr/sbin/nologin looktag
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080
ENV NODE_OPTIONS=--max-old-space-size=384
ENV HOME=/tmp
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/.output /app/.output
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/migrations /app/migrations
COPY --from=build /app/scripts/migrate.mjs /app/scripts/migrate.mjs
COPY --from=build /app/scripts/apply-migrations.mjs /app/scripts/apply-migrations.mjs
COPY --from=build /app/scripts/migration-plan.mjs /app/scripts/migration-plan.mjs
COPY --from=build /app/scripts/pg-pool.mjs /app/scripts/pg-pool.mjs
COPY --from=build /app/scripts/backfill-look-crops.mjs /app/scripts/backfill-look-crops.mjs
COPY --from=build /app/scripts/centered-crop.mjs /app/scripts/centered-crop.mjs
COPY --from=build /app/scripts/seed.mjs /app/scripts/seed.mjs
COPY --from=build /app/src/lib/providers/db/postgres.ts /app/src/lib/providers/db/postgres.ts
COPY --from=build /app/src/lib/providers/db/neon-pooler.ts /app/src/lib/providers/db/neon-pooler.ts
COPY --from=build /app/src/lib/providers/config-problems.ts /app/src/lib/providers/config-problems.ts
COPY --from=build /app/docker/entrypoint.sh /app/docker/entrypoint.sh
COPY --from=build /app/docker/check-env.ts /app/docker/check-env.ts
RUN chown -R 10001:10001 /app && chmod 755 /app/docker/entrypoint.sh
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
