# Admin Dashboard

Office-facing React app for running the platform. Everything a human must do — approve drivers, record offline payments, tune settings, inspect a stuck conversation — lives here. The bot never asks a driver to do anything the office can do instead.

## Stack and access

React + TypeScript + Vite. Served from `server/public` by the Express server
(copied there by `npm run build:all`; `npm run dev` on :5173 is the dev
alternative), API under `/api/admin`, token in `sessionStorage`, `phone +
password` login.

**Serving the dashboard.** `server/src/index.ts` mounts `server/public` as static
files **after** the API routes, plus an SPA fallback so deep links
(`/recover/:phone`, `/trips/:id`) survive a reload — without it they 404, which
is easy to miss because in-app navigation still works. `/api/*` that matches no
route returns a JSON 404, never HTML, so a typo looks like an API error rather
than a broken page.

`server/public` is gitignored: a committed build goes stale silently, and the
server cannot tell. If the folder is missing, startup logs:

```
[ADMIN UI] no build at …/server/public - run "npm run build:all" to serve the dashboard
```

Build and run everything with `npm run build:all` (see `docs/local-setup.md`).

| Item | Value |
|---|---|
| Mount | `/api/admin` |
| Auth | `POST /api/admin/login` → JWT; `authenticate` middleware on everything else |
| Credentials | `ADMIN_PHONE` + `ADMIN_PASSWORD_HASH` in `.env` (single office login for MVP) |
| 401 handling | Clears the token and reloads |

## Pages

| Page | Route | What it shows |
|---|---|---|
| Login | `/login` | Phone + password |
| Dashboard | `/` | Today's numbers, plus counts needing action (pending KYC, disputed trips, waiting help requests, lapsed subscriptions) |
| Drivers | `/drivers` | List, search, filter by approval and subscription status |
| Driver Detail | `/drivers/:id` | Everything about one driver — see below |
| Riders | `/riders` | List, search by phone/name |
| Rider Detail | `/riders/:id` | Profile, home location, rating, trip history, active trip |
| Trips | `/trips` | List, filter by status, search by trip number or phone |
| Trip Detail | `/trips/:id` | Full timeline — see below |
| Help | `/help` | Open help requests, oldest first — phone, waiting time, last messages, **Mark handled**. "Open only" toggle |
| Sessions | `/sessions` | Live `conversation_sessions` — **the state-machine debugger**. Filter, see stuck rows badged, and **Reset** any one of them inline |
| Recover | `/recover/:phone` | Diagnosis for one phone in plain language, plus reset / delete-session. Linked from Sessions and both detail pages |
| Analytics | `/analytics` | Funnel, driver leaderboard, area/route demand |
| Settings | `/settings` | Editable configuration |

### Driver Detail — the main control surface

| Section | Contents | Actions |
|---|---|---|
| Identity | Name, auto number, Aadhaar number, auto-verified flag | Edit all four; *Mark verified* stamps `vehicle_verified_at` |
| Coverage | Base location (map link + coords), radius | Edit base location, change radius |
| KYC | Aadhaar front/back, selfie, submitted date | **Approve / Reject / Suspend** |
| Subscription | `subscription_until`, trial end, payment history | **Set expiry date**, record offline payment (amount + cash/QR) |
| Stats | Leads sent / read, quotes sent, quotes won, median response time, cancels, completion rate, rating, quoted vs paid | — |
| Trips | Trip history, active trip | Open a trip |
| Role | Current role | **Override role** (office-only corrective action) |

**Seeding a driver** (the cold-start path) is a *Create driver* form here: phone, name, vehicle, base location, radius → inserted with `approval_status = 'approved'`. The driver never signs up and never has to agree to anything. Their first WhatsApp message simply resolves their role from the `drivers` table.

### Trip Detail — the investigation surface

- Trip number, status, rider, driver, created/closed timestamps
- Pickup and drop as map links (plus the free-text fallback if location was not attached)
- The typed destination text and the captured drop pin are shown side by side, so both survive
- **Dispute location** as a map link, when the rider shared it after answering No
- Distance, scheduled pickup time (if any), quote window close time
- **Quotes received**: driver, amount, status, time — including withdrawn and lapsed
- **Lead dispatches**: every driver offered, distance, sent/delivered/read timestamps
- **Event timeline**: everything from the `events` table in order
- **Message log**: full `bot_messages` transcript for the trip
- Actions: force a status change (with a reason), cancel, resolve a dispute

### Help — the queue that makes "we'll call you" true

Sending **help** (or disputing a trip) opens a row in `help_requests`. The Help
page lists them oldest-first with the phone, how long they have waited, and the
last three messages inline, so the office has context without opening Sessions.

Closing one is the only action. There is **one open request per phone** — a
second "help" is the same person still waiting, not a new ticket — so the queue
cannot be flooded by someone tapping help repeatedly.

`help_requests` is separate from `bot_messages` on purpose: the transcript is
history, this is state the office acts on (`opened_at` → `closed_at`).

### Sessions — why it matters
`docs/flows/rider.md` and `driver.md` are only correct if reality matches them. The Sessions page shows every live session's `phone`, `role`, `state`, `current_trip_id`, `data` JSONB and `updated_at`. When a rider reports "the bot stopped replying", this is the first place to look: a stale `state` or a leftover `pending_trip_id` is visible immediately.

It is also the only page that can **act**: every row has a **Reset**, and the phone links to
`/recover/:phone`. Rows whose state is normally transient (`awaiting_pickup_location`,
`awaiting_drop_location`, `awaiting_trip_confirm`) or untouched for over an hour are badged, so a
stuck conversation stands out without the office knowing the state machine.

### Recover — for less tech-literate users

A stuck session and a broken bot look identical to a rider: they message in and nothing sensible
comes back. The **Recover** panel (on Sessions links, and on both detail pages) exists so the office
can fix that without a deploy.

It answers "what is actually wrong with this person?" in words, then offers the action:

| Shown | Meaning |
|---|---|
| State + age | `awaiting_pickup_location · 3h ago` — a state they should have left |
| Live trip | A trip in `open`/`assigned`/`arrived`/`in_progress`/`disputed` is blocking a new booking |
| Waiting for help | An open `help_requests` row |
| Problems | Plain sentences, e.g. *"Stale pending_trip_id with no matching live trip — cancel and status will misbehave."* |

Two actions, both requiring confirmation:

- **Reset to idle** — keeps the row and the role, wipes `data` and `current_trip_id`. Fixes a stale
  `pending_trip_id` or an unhandled state. This is the common fix.
- **Delete session** — removes the row entirely, so the next message re-resolves the role from
  `riders`/`drivers`. Use when the Rider/Driver choice itself was wrong.

**Neither touches a live trip.** A trip is separate state, closed deliberately in Trip Detail where
the office can see it. So a full recovery from a wedged booking is *two* steps: close the trip, then
reset the session. `tests/flows/recover.test.ts` asserts exactly that — reset alone is not a bypass
for `one_active_trip_per_rider`.

Role override on a driver is labelled **"Switch this phone to the rider flow"** — it is a corrective
action for a wrong role, not a general reset.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/login` | Office login |
| GET | `/me` | Current admin |
| GET | `/stats` | Dashboard counters |
| GET | `/drivers` | List (`?approval=&subscription=&q=`) |
| POST | `/drivers` | **Seed a driver** |
| GET | `/drivers/:id` | Detail |
| PATCH | `/drivers/:id` | Edit name, vehicle, base location, radius |
| POST | `/drivers/:id/approval` | `{ action: approve \| reject \| suspend }` |
| POST | `/drivers/:id/kyc` | `{ action: approve \| reject }` |
| POST | `/drivers/:id/subscription` | `{ paid_amount_paise, paid_via, valid_until }` — records offline cash/QR |
| POST | `/drivers/:id/role` | Office role override |
| GET | `/riders` | List (`?q=`) |
| GET | `/riders/:id` | Detail |
| PATCH | `/riders/:id` | Edit name, home location |
| GET | `/trips` | List (`?status=&q=&page=`) |
| GET | `/trips/:id` | Detail |
| POST | `/trips/:id/status` | `{ status, reason }` |
| GET | `/trips/:id/quotes` | Quotes for a trip |
| GET | `/trips/:id/dispatches` | Who was offered, delivery/read state |
| GET | `/trips/:id/messages` | Transcript |
| GET | `/events` | Timeline (`?trip_id=`) |
| GET | `/sessions` | Live sessions |
| POST | `/sessions/:phone/reset` | **Recovery.** `{ to: 'idle' \| 'clear' }` — reset the session to idle, or delete it so the role re-resolves. Never touches a live trip |
| GET | `/recover/:phone` | Diagnosis for one phone: session, role, blocking trip, open help, and a plain-language list of problems |
| GET | `/help` | Help requests, open first (`?open=1`) — each with the last 3 messages |
| POST | `/help/:id/close` | Mark a help request handled |
| GET | `/messages` | Chat history for a phone (`?phone=`) |
| GET / PUT | `/settings` | Read and edit configuration |
| GET | `/analytics/funnel` | Stage-by-stage conversion |
| GET | `/analytics/drivers` | Response-rate leaderboard |
| GET | `/analytics/areas` | Demand by pickup area, unclaimed hotspots |
| GET | `/analytics/rollups` | Nightly aggregates (`?days=7`) |
| POST | `/analytics/rollup` | Backfill/re-run a day's rollup (`{ day }`, defaults to today) |

## Settings (editable, no deploy)

| Setting | Default | Notes |
|---|---|---|
| `quote_window_minutes` | 30 | How long a trip collects quotes before expiring |
| `max_drivers_per_lead` | 25 | Cap on drivers notified per trip |
| `default_radius_km` | 3 | Offered at driver signup |
| `radius_options` | 2, 3, 5, 8 | Signup buttons |
| `auto_pick_cheapest` | false | Off: rider must pick when the window closes. On: assign cheapest |
| `fare_check_enabled` | false | Quoted-vs-paid prompt after drop |
| `trial_days` | 30 | Trial length |
| `trial_min_rides` | 10 | Trial also requires this many completed rides |
| `subscription_price_paise` | — | Shown to drivers on lapse |
| `renewal_contact` | — | Phone shown to drivers on lapse |
| `helpline` | — | Number a person answers, given out on **help** and everywhere the bot says contact the office. Must not be the WhatsApp number — an API number cannot take calls |
| `office_number` | — | WhatsApp number that receives an alert for every new help request and dispute. Replies from it are logged, not answered. May be the same as `helpline` |
| `kyc_approved_template` | `kyc_approved` | Utility template sent when approving a driver idle >24h. Must match the name registered in Meta |
| `lead_template` | `new_lead` | Utility template sent as a lead to a driver idle >24h |
| `dispute_hours` | 24 | Silence before auto-dispute |

### Two things worth knowing

**KYC images are served as signed URLs** (1 hour), because the `kyc` bucket is
private — a public URL always returns `400`. The upload stores the object
**path**, not a URL; `signedUrl()` signs it on read. An expired link shows
*"could not load. Reload the page for a fresh link."* Use
`cd server && npm run check:kyc` to prove the whole path works.

**A failed KYC upload is reported, not swallowed.** `downloadAndUpload()` checks
the media type and a 5 MB ceiling, and returns an explicit error. On failure the
driver gets *"that photo did not come through — please send it again, or tap
Skip"* instead of a silent re-prompt. The reason is logged as
`[KYC UPLOAD FAILED]`. Without this a driver could retry forever, never be
approved, and never see a lead.

**Approve/Reject is hidden once a driver is approved** — re-approving silently
resets the trial, so only *Suspend* is offered. Deletion appears only when
`ALLOW_ADMIN_DELETE=true`, and the server rejects the request regardless of the UI.

## Not in the admin for MVP

- No payment gateway UI — subscription is recorded after offline cash/QR, nothing more
- No driver self-service billing portal
- No multi-role/permission model — one office login
