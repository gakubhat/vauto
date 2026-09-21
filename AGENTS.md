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
│   │   │                      delete-user, notify-driver
│   │   └── whatsapp/          spec, api (adapter), i18n, templates
│   ├── supabase/schema.sql    full schema, drop-and-recreate
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
8. **Location is attached, not typed** — `location_request_message` gives a
   native Send Location button. A typed area name is the fallback, never the ask.

---

## Commands

```bash
cd server
npm run dev              # API on :3000 (tsx watch)
npm test                 # vitest suites against the real DB
npm run sim -- --phone +919999000001 --as rider        # interactive REPL
npm run sim -- --script scripts/rider-demo.txt         # scripted replay
npm run sim -- --fresh   # wipe first
npm run check:whatsapp   # validate the access token
npm run tunnel           # ngrok + print Meta callback URL

cd ../admin && npm run dev    # dashboard on :5173, proxies /api to :3000

node scripts/gen-diagrams.mjs  # regenerate flow diagrams
npm run check:docs             # docs-vs-code drift guard (also runs in npm test)
```

## Testing rules

1. **Sequential, never parallel** — `fileParallelism: false`. Suites share one DB.
2. **`truncateAll()`** in `beforeEach` and `afterAll`. It is destructive and
   requires `ALLOW_DESTRUCTIVE_TESTS=true`.
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
- Forward-only SQL migrations; keep `supabase/schema.sql` in sync with the live
  schema.
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

The SQL to (re)apply lives in `scripts/enable-rls.sql`. `spatial_ref_sys` and
`storage.objects` are deliberately excluded.

## Known gaps / next

| Item | Status |
|---|---|
| **RLS** — enabled on `settings` only. Run `scripts/enable-rls.sql` to cover the rest | Half done |
| Admin credentials are still the `.env.example` placeholders | Change before any deployment |
| Kannada copy needs review by a native speaker | Open |
| Utility **template** messages (`sendTemplate`) exist but none are registered | Needed before drivers go idle >24h |
| Tap-to-call button (`tel:` / `voice_call`) | Deferred; number reveal used instead |
| `home_lat/home_lng` on riders | Written nowhere now; kept for a possible "book from home" |
| Analytics nightly rollups | Built; `POST /admin/analytics/rollup` to backfill |
