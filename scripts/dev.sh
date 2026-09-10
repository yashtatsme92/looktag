#!/bin/sh
# Looktag development launcher.
#
# Starts the app with the database and whatever integrations are configured.
# Unset DATABASE_URL → embedded PGLite (Postgres compiled to WASM). Set it to
# any Postgres URL (Neon, RDS, local) and migrations run before the server.
#
#   sh scripts/dev.sh              # foreground, logs to the terminal
#   sh scripts/dev.sh --background # start and return (used by startup.sh)
#   sh scripts/dev.sh --check      # print status, do not start
#
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

BACKGROUND=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --background|-b) BACKGROUND=1 ;;
    --check|-c) CHECK_ONLY=1 ;;
    --help|-h)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      echo "usage: sh scripts/dev.sh [--background] [--check]" >&2
      exit 2
      ;;
  esac
done

LOG=${LOOKTAG_DEV_LOG:-/tmp/app-startup.log}
PORT=${PORT:-8080}
HOST=${HOST:-0.0.0.0}

have() { command -v "$1" >/dev/null 2>&1; }

health() {
  curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"
}

backend=pglite
if [ -n "${DATABASE_URL:-}" ]; then
  backend=postgres
fi

auth=on
if [ -f .grok/app-env.json ] && grep -q '"VITE_AUTH_ENABLED"[[:space:]]*:[[:space:]]*"false"' .grok/app-env.json; then
  auth=off
fi
if [ "${VITE_AUTH_ENABLED:-}" = "false" ]; then
  auth=off
fi

xai=off
if [ -n "${XAI_API_KEY:-}" ]; then
  xai=on
fi

otel=off
if [ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]; then
  otel=on
fi

print_status() {
  echo "Looktag development"
  echo "  root        $ROOT"
  echo "  database    $backend$([ "$backend" = postgres ] && echo "  (DATABASE_URL)" || echo "  (embedded PGLite)")"
  echo "  auth        $auth"
  echo "  grok search $xai$([ "$xai" = on ] && echo "  (XAI_API_KEY)" || echo "  — set XAI_API_KEY for live shop search")"
  echo "  traces      $otel"
  echo "  listen      ${HOST}:${PORT}"
  echo "  studio      /admin/studio  (sign-up, Houses, search, rank)"
  echo "  design      /design"
}

print_status

if [ "$CHECK_ONLY" = 1 ]; then
  if health; then
    echo "  server      up"
  else
    echo "  server      down"
  fi
  exit 0
fi

if ! have node; then
  echo "node is required (Looktag targets Node 22)." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "installing dependencies…"
  npm install
fi

if [ "$backend" = postgres ]; then
  echo "applying migrations…"
  npm run db:migrate
else
  echo "PGLite will apply migrations/*.sql on first query."
fi

if health; then
  echo "already running on :${PORT}"
  [ "$BACKGROUND" = 1 ] && exit 0
  echo "stop the existing process first if you want a fresh start."
  exit 0
fi

export HOST PORT

if [ "$BACKGROUND" = 1 ]; then
  mkdir -p "$(dirname "$LOG")"
  npm run dev >>"$LOG" 2>&1 &
  echo "started (pid $!, log $LOG)"
  exit 0
fi

exec npm run dev
