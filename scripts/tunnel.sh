#!/usr/bin/env bash
#
# Start an ngrok tunnel for the WhatsApp webhook and print exactly what to
# paste into the Meta dashboard. Meta cannot reach localhost, so this is
# required before the bot will respond to anything.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env found at $ENV_FILE"
  exit 1
fi

# dotenv lets later duplicate keys win, so match that behaviour.
val() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

PORT="$(val PORT)"; PORT="${PORT:-3000}"
VERIFY_TOKEN="$(val WHATSAPP_WEBHOOK_VERIFY_TOKEN)"
BUSINESS_PHONE="$(val WHATSAPP_BUSINESS_PHONE)"

if ! curl -sf -m 2 "http://localhost:${PORT}/health" >/dev/null; then
  echo "Server is not responding on :${PORT}."
  echo "Start it first:  cd server && npm run dev"
  exit 1
fi

if ! command -v ngrok >/dev/null; then
  echo "ngrok not found. Install it:  brew install ngrok"
  exit 1
fi

# The inspector API answers 200 before the tunnel is registered, so poll for
# the public_url itself rather than for the API being up.
read_public_url() {
  curl -s -m 3 http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | cut -d'"' -f4 || true
}

if ! curl -sf -m 2 http://127.0.0.1:4040/api/tunnels >/dev/null; then
  echo "Starting ngrok on port ${PORT}..."
  nohup ngrok http "${PORT}" --log=stdout >/tmp/v3-ngrok.log 2>&1 &
fi

PUBLIC_URL=""
for _ in $(seq 1 30); do
  sleep 1
  PUBLIC_URL="$(read_public_url)"
  [[ -n "$PUBLIC_URL" ]] && break
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "Could not read the ngrok public URL. Is ngrok running? Check /tmp/v3-ngrok.log"
  exit 1
fi

cat <<EOF

WhatsApp webhook setup
======================

1. Meta for Developers -> your app -> WhatsApp -> Configuration
   -> Webhook -> Edit

     Callback URL : ${PUBLIC_URL}/webhook
     Verify token : ${VERIFY_TOKEN}

2. Click "Verify and save".
   Then subscribe to these webhook fields:
     - messages   (required - inbound rider/driver messages)
     - statuses   (optional - delivery and read receipts)

3. Send a WhatsApp message to: ${BUSINESS_PHONE}
   You should get the Kannada role-selection buttons back.

Local checks
------------
  health           http://localhost:${PORT}/health
  verify handler   curl "${PUBLIC_URL}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345"
  ngrok inspector  http://127.0.0.1:4040
  server log       tail -f /tmp/v3server.log

NOTE: ${PUBLIC_URL} changes every time ngrok restarts
(free plan). Re-run this script and update the callback URL in Meta.

EOF
