# Admin Dashboard

Office-facing React app for running the platform. Everything a human must do — approve drivers, record offline payments, tune settings, inspect a stuck conversation — lives here. The bot never asks a driver to do anything the office can do instead.

## Stack and access

React + TypeScript + Vite. Served from `admin/dist` by the Express server (or `npm run dev` on :5173), API under `/api/admin`, token in `sessionStorage`, `phone + password` login.

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
| Dashboard | `/` | Today's numbers, plus counts needing action (pending KYC, disputed trips, lapsed subscriptions) |
| Drivers | `/drivers` | List, search, filter by approval and subscription status |
| Driver Detail | `/drivers/:id` | Everything about one driver — see below |
| Riders | `/riders` | List, search by phone/name |
| Rider Detail | `/riders/:id` | Profile, home location, rating, trip history, active trip |
| Trips | `/trips` | List, filter by status, search by trip number or phone |
| Trip Detail | `/trips/:id` | Full timeline — see below |
| Sessions | `/sessions` | Live `conversation_sessions` — **the state-machine debugger** |
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
- Distance, scheduled pickup time (if any), quote window close time
- **Quotes received**: driver, amount, status, time — including withdrawn and lapsed
- **Lead dispatches**: every driver offered, distance, sent/delivered/read timestamps
- **Event timeline**: everything from the `events` table in order
- **Message log**: full `bot_messages` transcript for the trip
- Actions: force a status change (with a reason), cancel, resolve a dispute

### Sessions — why it matters

`docs/flows/rider.md` and `driver.md` are only correct if reality matches them. The Sessions page shows every live session's `phone`, `role`, `state`, `current_trip_id`, `data` JSONB and `updated_at`. When a rider reports "the bot stopped replying", this is the first place to look: a stale `state` or a leftover `pending_trip_id` is visible immediately.

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
| `auto_pick_cheapest` | true | Auto-accept cheapest at window close |
| `fare_check_enabled` | false | Quoted-vs-paid prompt after drop |
| `trial_days` | 30 | Trial length |
| `trial_min_rides` | 10 | Trial also requires this many completed rides |
| `subscription_price_paise` | — | Shown to drivers on lapse |
| `renewal_contact` | — | Phone shown to drivers on lapse |
| `dispute_hours` | 24 | Silence before auto-dispute |

### Two things worth knowing

**KYC images are served as signed URLs** (1 hour), because the `kyc` bucket is
private — a public URL always returns `400`. An expired link shows *"could not
load. Reload the page for a fresh link."* Use `cd server && npm run check:kyc`
to prove the whole path works.

**Approve/Reject is hidden once a driver is approved** — re-approving silently
resets the trial, so only *Suspend* is offered. Deletion appears only when
`ALLOW_ADMIN_DELETE=true`, and the server rejects the request regardless of the UI.

## Not in the admin for MVP

- No payment gateway UI — subscription is recorded after offline cash/QR, nothing more
- No driver self-service billing portal
- No multi-role/permission model — one office login
