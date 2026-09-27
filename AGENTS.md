# AGENTS.md — V3 Auto Board

> **Read this first.** It is the single source of truth for conventions and hard
> rules. Product design lives in `docs/`.

## What this is

A WhatsApp-first **lead platform** for auto rickshaw booking in mid-tier
Karnataka towns. A rider posts a trip; nearby drivers reply with **their own
price**; the rider picks one. Payment is rider → driver, offline. Drivers pay a
flat subscription for access to leads.

**This is not an aggregator.** The platform never sets, suggests or collects a
fare, takes no commission, and handles no payment.

Target users are less tech-literate: WhatsApp, not an app; buttons and numbers,
not typed text; **Kannada-first** with an English toggle.

---

## UPDATE THE DOCS WHENEVER THE FLOW CHANGES — REQUIRED

The flow docs are not documentation of last resort; they are the contract. A
change to the bot's behaviour is **not complete** until the docs match. This is
the single most common way this codebase has gone wrong.

### If you change a state, a transition, or an action

1. Edit **`docs/flows/transitions.json`** — the source of truth for diagrams
2. Run **`node scripts/gen-diagrams.mjs`** — regenerates both Mermaid diagrams
3. Update the **states table** in the affected `docs/flows/*.md`
4. Update the **message priority tables** — a new command changes priority order
5. Add or update the **edge case** describing it
6. Update the **button ID table** if you added a button

### If you change the schema, product rules, or lifecycle

Update `docs/overview.md` (data model, hard rules, lifecycle diagram, analytics).

### If you change anything a user sees

Update `docs/admin.md` (dashboard), `docs/local-setup.md` (WhatsApp setup), or
`docs/testing.md` (harness) as appropriate.

### The build checks this for you

`npm test` includes a **docs drift guard** (`server/tests/docs.test.ts`). It fails
when:

- a state is in `transitions.json` but not the states table (or vice versa)
- flow code references a state that is not in `transitions.json`
- a button the code can send is missing from the flow docs
- an admin route is missing from `docs/admin.md`
- an analytics event is missing from `docs/overview.md`
- any doc refers to the previous project

Run it alone with **`npm run check:docs`**. Do not weaken a check to make it pass -
fix the doc, or the code.

### Always

- **Add a test that would have caught the bug** you just fixed. Assert the
  specific broken behaviour (state after an action, message content, DB status).
- **Run `npm test`** before claiming done. Quote the output. "Should work" is
  not a success claim.

Docs in this repo:

| File | Contents |
|---|---|
| `docs/overview.md` | Product, hard rules, routing, schema, lifecycle, analytics, implementation order |
| `docs/flows/rider.md` | Rider state machine, priority tables, edge cases |
| `docs/flows/driver.md` | Driver state machine, priority tables, edge cases |
| `docs/flows/transitions.json` | Source of truth for both diagrams |
| `docs/admin.md` | Admin dashboard pages, API, settings |
| `docs/testing.md` | Simulator CLI and vitest suites |
| `docs/local-setup.md` | ngrok tunnel, Meta webhook config, debugging |

---

## Repository layout

```
/
├── AGENTS.md                  <- you are here
├── .env                       (gitignored)  .env.example is the template
├── docs/
│   ├── overview.md
│   ├── flows/{rider,driver}.md
│   ├── flows/transitions.json
│   ├── admin.md  testing.md  local-setup.md
├── scripts/
│   ├── tunnel.sh              ngrok + Meta callback URL
│   └── gen-diagrams.mjs       renders diagrams from transitions.json
├── server/
│   ├── src/
│   │   ├── config.ts          env access - add new vars here
│   │   ├── index.ts           express app, mounts routes, starts scheduler
│   │   ├── scheduler.ts       60s: scheduled leads, quote-window expiry
│   │   ├── routes/            webhook.ts (inbound), admin.ts (dashboard API)
│   │   ├── state/
│   │   │   ├── store.ts       session get/upsert/reset
│   │   │   ├── queries.ts     typed DB access
│   │   │   ├── onboarding.ts  pre-role: language then rider/driver
│   │   │   └── flows/         rider.ts, driver.ts
│   │   ├── lib/               matching, send, events, money, geo, phone,
│   │   │                      delete-user, notify-driver, help
│   │   └── whatsapp/          spec, api (adapter), i18n, templates
│   ├── supabase/schema.sql    the one schema file, drop-and-recreate
│   └── tests/                 harness.ts (no vitest), engine.ts (vitest wiring)
└── admin/                     React dashboard (vite)
```

---

## Hard rules (product-defining)

1. **One WhatsApp number**, role-based routing. Role chosen once at first
   contact and permanent; office can override. **A driver can never book a ride.**
2. **Price is always driver-quoted.** Never compute, anchor or display a price.
3. **Money is integer paise.** No floats, ever.
4. **One active trip per rider and per driver**, enforced by partial unique
   indexes in Postgres — never by application logic alone.
5. **No chat relay.** Phone numbers are revealed to *both* parties on assignment
   (reciprocal), and only then.
6. **No online payments.** Subscription recorded by office after offline cash/QR.
7. **No driver online/offline toggle.** Drivers are always in the matching pool;
   presence is inferred from delivery/read receipts, never asked for.
8. **Pickup and a driver's base are attached, not typed.** Both come from
   `location_request_message`'s native Send Location button; matching runs on
   coordinates, so a typed name is rejected and re-prompted. The **destination**
   may be typed (`drop_text`) — the driver reads it and quotes from local
   knowledge — and the missing pin is optionally collected after the ride
   (`awaiting_drop_proof`).

---

## Commands

```bash
cd server
npm run dev              # API on :3000 (tsx watch)
npm run build:all        # build admin, copy to server/public, start (one origin)
npm test                 # vitest suites against the real DB
npm run sim -- --phone +919999000001 --as rider        # interactive REPL
npm run sim -- --script scripts/rider-demo.txt         # scripted replay
npm run sim -- --fresh   # wipe first
npm run check:whatsapp   # validate the access token
npm run tunnel           # ngrok + print Meta callback URL

cd ../admin && npm run dev    # dashboard on :5173, proxies /api to :3000
                              # (dev alternative to build:all — not both at once)

node scripts/gen-diagrams.mjs  # regenerate flow diagrams
npm run check:docs             # docs-vs-code drift guard (also runs in npm test)
```

## Testing rules

1. **Sequential, never parallel** — `fileParallelism: false`. Suites share one DB.
2. **`truncateAll()`** in `beforeEach` and `afterAll`. It is destructive and
   requires `ALLOW_DESTRUCTIVE_TESTS=true`. **Every table with an FK to a wiped
   table must itself be wiped first** — `driver_daily` references `drivers`, so
   if it is left out the `drivers` delete is rejected and every suite fails with
   `driver_daily_driver_id_fkey`. Add new tables to `truncateAll()`.
3. **Assert on state, DB and messages** — messages can look right while the
   state is wrong. Use `stateOf(phone)`.
4. `sendMessage` is never called for real: `setupMockSendMessage()` installs a
   capture transport via `setTransport()`. Do not monkey-patch module exports —
   ESM makes them non-writable.
5. 30s timeout for full-lifecycle tests; they hit the real database.

## Conventions

- TypeScript strict, `noImplicitAny`. `npm run build` / `tsc --noEmit` must pass.
- **One concern per file**; ~300 lines of logic is the point to split.
- **Read surrounding code first** and mirror its style and error handling.
- **No comments unless asked** — the only accepted ones explain *why*.
- Flow code emits the abstract `OutMessage` spec and never builds a WhatsApp
  payload. New message shapes go in `whatsapp/spec.ts` + `api.ts`.
- **WhatsApp label caps**: reply buttons 20 chars, list rows 24, section titles
  24. Meta rejects the whole message if a section title is too long, and a
  missing i18n key renders the raw id as the button. `tests/whatsapp.test.ts`
  guards both — it needs no database, so run it freely.
- **One schema file.** `server/supabase/schema.sql` is the single source of
  truth — drop-and-recreate, applied to the live project directly. There are no
  separate migration scripts. If you change the schema, update `schema.sql` and
  apply the delta to the live database; the file and the live schema must match
  column for column.
- **Never commit secrets.** `.env` is gitignored.

## Session resets are a known hazard

`resetSession()` clears `data` to `{}`; `upsertSession()` merges. Use a full
reset when a trip closes — but **pass `data: { pending_trip_id }` explicitly if
later states need it**. Losing that key has silently broken cancel and status
twice. Also note merging `{}` over existing keys does nothing.

## Row Level Security

All application tables have RLS enabled with **no policies**. The backend uses
the service role key, which has `BYPASSRLS`, so it is unaffected — anon and
authenticated keys get zero rows.

Two consequences to remember:

- **A leaked service role key is still catastrophic** — it bypasses RLS. Never
  expose it; keep `.env` out of the repo and out of the client bundle.
- **Any new code using the anon/publishable key will silently return zero rows.**
  That is intentional, but it looks like "the query is broken". All data access
  must go through the backend with the service role key.

**A new table needs RLS enabled explicitly.** `scripts/enable-rls.sql` is the
source of truth and lists every table; add the new table there and run it, or
its rows are world-readable to anyone holding the publishable key. Applied to
the live project on 2026-09-30 — all 16 application tables, `help_requests`
included. `spatial_ref_sys` and `storage.objects` are deliberately excluded.

## Known gaps / next

| Item | Status |
|---|---|
| **RLS** | Enabled on **all 16 application tables** (no policies). Applied live 2026-09-30. Add new tables to `scripts/enable-rls.sql` | Done |
| Webhook signature | `X-Hub-Signature-256` verified on every POST; forged requests get 401. Needs `WHATSAPP_APP_SECRET` | Done |
| Per-staffer admin logins | Still one `ADMIN_PHONE` + password, one 12h JWT. No audit trail of *which* staffer acted | Open — before real data |
| **`office_alert` template** | Office alerts are free-form, so they are dropped outside the 24h window. Register the template before relying on alerts | Open — add before real data |
| Admin credentials are still the `.env.example` placeholders | Change before any deployment | Open |
| Kannada copy needs review by a native speaker | Open |
| Utility **template** messages | Built — `lead_template` and `kyc_approved_template` are configured in Admin → Settings. Both must be registered and approved in Meta | Done (needs Meta registration) |
| Tap-to-call button (`tel:` / `voice_call`) | Deferred; number reveal used instead |
| `home_lat/home_lng` on riders | Written nowhere now; kept for a possible "book from home" |
| Analytics nightly rollups | Built; `POST /admin/analytics/rollup` to backfill |
