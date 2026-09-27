# Local Setup — talking to WhatsApp

The bot cannot receive anything until Meta can reach your machine. This is the
whole setup, in order.

## 1. Prerequisites

| Requirement | Check |
|---|---|
| ngrok | `brew install ngrok` |
| Server running | `curl localhost:3000/health` |
| `.env` present | at the repo root (copy `.env.example` to start) |

## 2. Run the tunnel script

```bash
./scripts/tunnel.sh
```

It verifies the server is up, starts ngrok if needed, reads the public URL from
ngrok's local API, and prints exactly what to paste into Meta:

```
Callback URL : https://xxxx.ngrok-free.app/webhook
Verify token : <WHATSAPP_WEBHOOK_VERIFY_TOKEN>
```

Add `npm run tunnel` as a shortcut if you prefer — it just calls this script.

## 3. Configure Meta

Meta for Developers → your app → **WhatsApp → Configuration → Webhook → Edit**:

1. Paste the Callback URL and Verify token, click **Verify and save**
2. Subscribe to webhook fields:
   - **`messages`** — required. Inbound rider and driver messages
   - **`statuses`** — optional but recommended. Delivery and read receipts, which
     is how presence is inferred without asking drivers anything
3. **Copy the App secret** (Meta for Developers → your app → Settings → Basic →
   App secret) into `WHATSAPP_APP_SECRET` in `.env`, then restart the server.

**Every webhook POST is verified against `X-Hub-Signature-256`.** Without the
secret set, the server refuses to start (`Missing required env var`). With it
set but *wrong*, every inbound message is rejected with `401` and the bot goes
silent — so if riders or drivers report "the bot stopped replying" right after
this step, check the server log for:

```
[WEBHOOK] rejected: invalid or missing X-Hub-Signature-256
```

That is the signature check working, not a bug. The secret is compared in
constant time against an HMAC of the **raw** request body, so it cannot be
forged by re-serialising the JSON.

4. Send a WhatsApp message to `WHATSAPP_BUSINESS_PHONE` from your phone

You should receive the role-selection buttons (Rider / Driver) in Kannada.

## 4. Verifying the handler without Meta

```bash
TOKEN=$(grep '^WHATSAPP_WEBHOOK_VERIFY_TOKEN=' .env | tail -1 | cut -d= -f2-)
curl "localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=12345"
```

Prints `12345` if the verify handler is correct. If it does, any failure beyond
this is reachability or credentials — not code.

## Gotchas

**URL-encode the verify token when testing by hand.** Our token contains a `+`,
which a query string decodes as a space, so a raw `curl` returns `Forbidden`
even though the token is correct. Meta encodes it properly, so dashboard
verification works — but manual curl does not:

```bash
TOKEN=$(grep '^WHATSAPP_WEBHOOK_VERIFY_TOKEN=' .env | tail -1 | cut -d= -f2-)
ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$TOKEN")
curl "localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=$ENC&hub.challenge=12345"
# -> 12345
```

**ngrok URLs change on every restart** (free plan). Every restart means updating
the Callback URL in Meta. A paid static domain removes this.

**`WHATSAPP_ACCESS_TOKEN` may be a 24-hour token** if you copied it from the
dashboard's "temporary access token". Outbound messages will fail once it
expires, with `[WHATSAPP SEND FAILED]` in the server log. Generate a permanent
token from a System User in Meta Business Suite.

**Meta test numbers can only send to 5 verified recipients.** Add your own phone
number under *To* in the API Setup page, or you will receive inbound messages
but never get replies.

**The server serves the admin UI.** Build and start both together:

```bash
cd server && npm run build:all        # build admin → copy to server/public → start
```

Then the dashboard is on the **same origin** as the API (`http://localhost:3000`),
which means no CORS and one thing to tunnel. Open `http://localhost:3000`.

For active frontend work, `cd admin && npm run dev` on `:5173` is faster — it
proxies `/api` to `:3000` and hot-reloads. The two are alternatives, not both:
running Vite alongside a server that is also serving `server/public` means two
copies of the dashboard, which is confusing when only one shows your change.

`npm run build:all -- --no-start` builds and copies without starting, if you
want to run the server yourself.

## Debugging

| Where | What |
|---|---|
| `/tmp/v3server.log` | inbound messages, `[RIDER FLOW ERROR]`, `[WHATSAPP SEND FAILED]` |
| http://127.0.0.1:4040 | ngrok inspector — see the actual webhook POSTs from Meta |
| Admin → Sessions | live `conversation_sessions` — the state-machine debugger |
| Admin → Trips → a trip | full timeline, quotes, dispatches, message transcript |

If a message arrives but nothing replies, look at Sessions first: a stuck state
or a leftover `pending_trip_id` is visible immediately.

## Testing without WhatsApp at all

Most development needs no Meta connection:

```bash
cd server
npm test                                            # vitest suites against real DB
npm run sim -- --phone +919999000001 --as rider      # interactive REPL
npm run sim -- --script scripts/rider-demo.txt       # scripted replay
```

See `docs/testing.md`.
