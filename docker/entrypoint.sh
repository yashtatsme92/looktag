#!/bin/sh
# Migrate, then start the server. Missing configuration is logged by name and
# served as a page. This script does not print values and does not exit on them.
set -eu
cd /app
node --experimental-strip-types docker/check-env.ts
if [ "${MIGRATE_ON_START:-1}" != "0" ]; then
  node --experimental-strip-types scripts/migrate.mjs
fi
exec node .output/server/index.mjs
