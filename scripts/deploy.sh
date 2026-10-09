#!/usr/bin/env bash
#
# Build everything and deploy to Fly.io in one step.
#
#   bash scripts/deploy.sh                 preflight, build+push+deploy, verify
#   bash scripts/deploy.sh --skip-checks   deploy without the local tsc/tests
#   bash scripts/deploy.sh --app my-app    override the app name from fly.toml
#
# `fly deploy` builds the Dockerfile on Fly's builder - both the admin bundle
# and the server - pushes the image and rolls the machine. The preflight here
# only catches what is cheap to catch locally: it runs `npm test`, which is the
# fast, DB-free suite, and never the destructive database flow suites.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP=""
SKIP_CHECKS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-checks) SKIP_CHECKS=1; shift ;;
    --app) APP="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ -z "$APP" ]; then
  APP="$(grep -E '^app[[:space:]]*=' fly.toml | head -1 | cut -d'"' -f2)"
fi
if [ -z "$APP" ]; then
  echo "ERROR: could not read the app name from fly.toml; pass --app <name>." >&2
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "ERROR: flyctl is not installed. See https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi

if [ "$SKIP_CHECKS" -eq 0 ]; then
  say "1/3  Preflight: types and the fast test suite"
  ( cd server && npx tsc --noEmit )
  ( cd admin && npx tsc --noEmit )
  ( cd server && npm test )
else
  say "1/3  Preflight skipped"
fi

say "2/3  Building and deploying to Fly ($APP)"
fly deploy --app "$APP" --ha=false

say "3/3  Verifying the live app"
# The machine is replaced during a deploy; wait for the new one to answer.
for _ in $(seq 1 30); do
  curl -fsS "https://$APP.fly.dev/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "https://$APP.fly.dev/health"; echo
CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  "https://$APP.fly.dev/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")"
if [ "$CODE" = "403" ]; then
  echo "webhook rejects a bad verify token (403)"
else
  echo "WARNING: webhook returned $CODE, expected 403"
fi

say "Deployed: https://$APP.fly.dev"
echo "Logs:  fly logs -a $APP"
echo "Roll back:  fly releases -a $APP   then   fly deploy --image <previous> -a $APP"
