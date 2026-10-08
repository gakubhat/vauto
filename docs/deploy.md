# Deploying VAuto

One always-on container serves everything: the API, the built admin dashboard,
the WhatsApp webhook and the 60s scheduler, all on one origin. The database,
PostgREST and file storage are Supabase. WhatsApp is Meta's Cloud API.

Because the scheduler and webhook must run continuously, the host can never
sleep or scale to zero.

| Piece | Where | Cost |
|---|---|---|
| App (API + admin + scheduler) | Fly.io machine | ~$2–5/mo |
| Database + PostgREST + Storage | Supabase Free | $0 |
| TLS + hostname | Fly subdomain, or a domain + Caddy | $0 |
| WhatsApp | Meta Cloud API | usage only |

The same image runs on a plain VPS with Docker Compose — see [VPS fallback](#vps-fallback).

---

## 1. Supabase

1. Create a project in **`ap-south-1` (Mumbai)** so the app's many small
   queries are not crossing an ocean. Copy the project URL and the
   **service role key** (Project Settings → API).
2. Apply the schema. `server/supabase/schema.sql` is a single drop-and-recreate
   file — the source of truth. Run it in the SQL editor, or:

   ```bash
   psql "$SUPABASE_DB_URL" -f server/supabase/schema.sql
   ```

   On an existing database, apply only the delta you added.
3. Create a **private** Storage bucket named `kyc` (or set `STORAGE_BUCKET_KYC`).
4. Confirm Row Level Security matches `scripts/enable-rls.sql` — every
   application table should have it on with no policies.

## 2. Meta / WhatsApp

You need a Meta app with the WhatsApp product and a real (verified) phone
number. The test number can only message a handful of recipients.

From Meta, collect: **App secret**, a **permanent System User token**, the
**phone number ID**, and the **business phone** number. Put them in the secrets
below. Set the webhook callback to `https://<your-host>/webhook` with a verify
token of your choosing, and subscribe to the **`messages`** field.

Templates (`new_lead`, `kyc_approved` by default) must be created and approved
in Meta, then named in Admin → Settings.

## 3. Fly.io

```bash
# once
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login
fly apps create vauto        # pick a globally-unique name, set it in fly.toml

# secrets - the app refuses to boot without the required ones
fly secrets set \
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  ADMIN_PHONE="+91..." \
  ADMIN_PASSWORD="..." \
  SUPABASE_URL="https://xxxx.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  WHATSAPP_WEBHOOK_VERIFY_TOKEN="..." \
  WHATSAPP_ACCESS_TOKEN="..." \
  WHATSAPP_APP_SECRET="..." \
  WHATSAPP_PHONE_NUMBER_ID="..." \
  WHATSAPP_BUSINESS_PHONE="+91..."

# deploy
fly deploy

# verify
curl https://<your-app>.fly.dev/health
```

`fly.toml` keeps `min_machines_running = 1` and `auto_stop_machines = false` on
purpose — do not change those; the scheduler and webhook need the machine up.
`NODE_ENV=production` is already set, which also means the destructive test
database switch stays off.

Optional secrets (only if you use them): `GEOCODER` (`nominatim` by default, or
`google` + `GOOGLE_MAPS_API_KEY`), `WHATSAPP_API_VERSION`, `DEFAULT_RADIUS_KM`,
`TRIP_OTP_TTL_SECONDS`, `LOG_LEVEL`.

Leave `ALLOW_ADMIN_DELETE=false` and `ALLOW_OFFICE_AS_USER=false` in production.

## 4. Backups

Supabase Free has **no** point-in-time recovery, so run `deploy/backup.sh` on a
daily cron and copy the dump off the machine (Backblaze B2, S3, or `rclone`):

```bash
SUPABASE_DB_URL='postgresql://...' BACKUP_DIR=/var/backups/vauto ./deploy/backup.sh
```

Test a restore once: `gunzip -c dump.sql.gz | psql "$SUPABASE_DB_URL"`.

Note this covers **data**, not the `kyc` Storage bucket — driver documents are
not in the SQL dump. Export them separately if you need full recoverability.

## 5. Keeping Supabase Free awake

Free projects pause after a week of inactivity, and a paused project needs a
manual resume. In practice the running app queries Supabase at least once a
minute, so this will not happen while the service is up. As a belt-and-braces
measure when the app is down, run `deploy/heartbeat.sh` daily. (Pinging the
app's own `/health` does **not** help — it never touches Supabase.)

Supabase also emails a warning ~a week before a pause; watch for it.

## 6. Monitoring

- Point an uptime monitor at `https://<host>/health`.
- Watch `fly logs` for `[LEAD SEND FAILED]` and `[WEBHOOK]` signature errors.
- Meta's WhatsApp Manager shows template status and delivery failures.

## 7. Deploying updates

```bash
fly deploy                 # build + rolling restart
fly releases               # list
fly deploy --image <prev>  # or: fly releases rollback
```

Apply schema changes **before** deploying code that depends on them, and keep
them backwards-compatible for the length of a deploy.

## VPS fallback

The image is portable; nothing here is Fly-specific.

```bash
git clone <repo> && cd <repo>
cp .env.example .env       # fill in every required value
DOMAIN=vauto.example.com docker compose up -d --build
```

Caddy gets TLS automatically once `DOMAIN` resolves to the host. The container
publishes only through Caddy; `app` is not exposed directly. Same backup and
heartbeat scripts apply.
