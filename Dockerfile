# Looktag production image — a Node server, not a vendor-specific function.
# Any host that runs containers works (Fly, Railway, a VPS, Kubernetes).
#
#   docker build -t looktag .
#   docker run -p 8080:8080 -e APP_URL=https://your.domain looktag
#
# Optional env:
#   DATABASE_URL  Postgres (Neon, RDS, …). Unset → embedded PGLite.
#   APP_URL       Public origin for share / canonical links.
#   NITRO_PRESET  Override at build time; this image always builds node-server.
#   OTEL_EXPORTER_OTLP_ENDPOINT  Traces / metrics / logs collector.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080
COPY --from=build /app/.output /app/.output
COPY --from=build /app/package.json /app/package.json
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
