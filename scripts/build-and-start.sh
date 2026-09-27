#!/usr/bin/env bash
#
# Build the admin dashboard and serve it from the API server.
#
#   npm run build:all        build + copy + start
#   npm run build:all -- --no-start   just build and copy
#
# The dashboard is a static Vite bundle. It is copied into server/public, which
# is gitignored, so a checkout never carries a stale build and the server can
# tell "never built" from "built and ready".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN="$ROOT/admin"
SERVER="$ROOT/server"
OUT="$SERVER/public"

START=1
for arg in "$@"; do
  [ "$arg" = "--no-start" ] && START=0
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/4  Building the admin dashboard"
cd "$ADMIN"
if [ ! -d node_modules ]; then
  echo "    installing admin dependencies (first run)"
  npm install --silent
fi
npm run build

# Fail loudly rather than copying nothing and leaving the server with no UI,
# or worse, a stale one from a previous run.
if [ ! -f "$ADMIN/dist/index.html" ]; then
  echo "ERROR: admin/dist/index.html missing - the admin build did not produce output." >&2
  exit 1
fi

say "2/4  Copying into server/public"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$ADMIN/dist/." "$OUT/"

if [ ! -f "$OUT/index.html" ]; then
  echo "ERROR: copy produced no index.html in $OUT" >&2
  exit 1
fi
echo "    $(find "$OUT" -type f | wc -l | tr -d ' ') files -> server/public"

say "3/4  Building the server"
cd "$SERVER"
npm run build

if [ ! -f "$SERVER/dist/index.js" ]; then
  echo "ERROR: server build produced no dist/index.js" >&2
  exit 1
fi

if [ "$START" -eq 0 ]; then
  say "Done (--no-start). Run: cd server && npm start"
  exit 0
fi

say "4/4  Starting the server"
echo "    Dashboard and API on http://localhost:${PORT:-3000}"
echo "    Webhook stays at /webhook - point Meta at the same host."
echo ""
exec npm start
