#!/usr/bin/env bash
#
# Keep a Supabase Free project from being paused for inactivity.
#
#   SUPABASE_URL=https://xxxx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=... ./deploy/heartbeat.sh
#
# While the app is running this is redundant: the server already queries
# Supabase at least once every 60 seconds, which is what stops the pause. It
# only matters when the app is down for a long stretch, so install it as a
# daily cron on the host as a belt-and-braces keep-alive:
#
#   17 6 * * *  cd /opt/vauto && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./deploy/heartbeat.sh >> /var/log/vauto-heartbeat.log 2>&1
#
# Note: pinging the app's own /health does NOT touch Supabase (it returns static
# JSON), so it would not reset the inactivity timer. This hits the database.
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"

code="$(curl -s -o /dev/null -w '%{http_code}' \
  "$SUPABASE_URL/rest/v1/settings?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

echo "supabase heartbeat: HTTP $code ($(date -u +%FT%TZ))"
[ "$code" = "200" ] || exit 1
