# Testing & WhatsApp Simulator

Two tools, same engine:

1. **A CLI simulator** — drive the bot by hand, see exactly what a rider or driver would see. For exploring a flow and eyeballing state correctness.
2. **vitest suites** — the same engine driven by assertions. For locking behaviour in so it cannot regress.

Both run against the **real Supabase project** from `.env`, with the outbound transport replaced so no message ever reaches Meta.

## Why this matters here

The rider and driver state machines are the product. A state that silently falls through, or a stale `pending_trip_id`, produces a bot that stops replying — and nobody notices until a rider complains. The simulator makes the state visible; the suites make it enforceable.

## Architecture

```
Inbound payload (text / location / image / button tap)
        │
        ├──► CLI simulator ──► renders bot replies as a transcript
        │
        └──► vitest ────────► assertions on messageLog + real DB state

Both call handleRiderMessage() / handleDriverMessage() directly.
sendMessage() is mocked and every payload is captured in messageLog[].
```

## Engine — `server/tests/engine.ts`

| Export | Purpose |
|---|---|
| `messageLog` | Every outbound payload, in order, with `to`, `payload`, `idx` |
| `setupMockSendMessage()` | Installs the `sendMessage` mock |
| `riderStep(input)` | Feed an input to the rider handler |
| `driverStep(phone, input)` | Feed an input to a specific driver |
| `inboundWebhook(payload)` | Feed a **raw webhook payload** — exercises role resolution and routing, not just the handlers |
| `findButtonId(prefix, toPhone?)` | Last button/list ID matching a prefix, e.g. `findButtonId('accept_quote_')` |
| `messagesTo(phone)` | All messages sent to one number |
| `messagesSince(n)` | Everything after index `n` — for asserting "sent after this action" |
| `lastMessage()` | Most recent message |
| `renderLog()` | Human-readable transcript (text, buttons, lists, locations) |
| `stateOf(phone)` | Current `{ state, role, data }` — **assert on this directly** |
| `truncateAll()` | Wipe all application tables between tests, children before parents |
| `seedDriver(phone, opts)` | Insert a driver at known coordinates. `opts`: `name`, `vehicle`, `lat`, `lng`, `radiusKm`, `approved`, `subscriptionUntil`, `language` |
| `seedRider(phone?, name?)` | Insert a rider |
| `startAsNewRider(phone)` / `startAsNewDriver(phone)` | Drop a phone at the first signup step |
| `riderStepAs(phone, input)` | Rider input for a phone other than the default |
| `findButtonIdSince(prefix, phone, idx)` | Like `findButtonId`, but only after a message index |
| `bodyOf(msg)` | Text body of a captured message |
| `TEST_ADDRESS` | The fixed address the stubbed geocoder returns |
| `seedRider(...)` | Insert a rider |

### Input shapes

```ts
{ text: '70' }                              // typed message or button id
{ location: { lat: 12.97, lng: 77.59 } }    // location attachment
{ image: 'kyc-aadhaar-front.jpg' }          // image upload (file from fixtures)
{ text: 'accept_quote_<uuid>' }             // button tap — ids are what the bot sees
```

Button taps are simulated by passing the button **id** as text, because `extractText` returns `id` in preference to `title`. That matches production exactly.

### Asserting on state

Assert the session, not just the messages:

```ts
expect(await stateOf(RIDER_PHONE)).toMatchObject({
  role: 'rider',
  state: 'collecting_quotes',
  data: { pending_trip_id: expect.any(String) },
});
```

## CLI simulator — `npm run sim`

```
npm run sim -- --phone +919999000001 --as rider
npm run sim -- --phone +919999000002 --as driver
```

An interactive REPL:

```
rider> ಆಟೋ
🤖 [0] Bot → Buttons
   Body: Send your pickup location
   Buttons:
     [Send location] → `send_location`

rider> <location 12.97, 77.59>
🤖 [1] Bot (Text)  Body: Now send your destination
   state: awaiting_drop_location

rider> <location 12.98, 77.60>
🤖 [2] Bot → Buttons
   Body: Gandhi Circle → Bus Stand, 1.8 km
   Buttons:
     [Book now] → `book_now`   [Schedule] → `schedule`

rider> book_now
🤖 [3] Bot (Text)  Body: Finding an auto. We'll message you as quotes arrive.
   state: collecting_quotes   trip: open   drivers notified: 4
```

Flags:

| Flag | Effect |
|---|---|
| `--phone` | Which number to impersonate |
| `--as rider \| driver` | Force a role instead of resolving it |
| `--fresh` | Wipe sessions and trips before starting (needs `TEST_SUPABASE_*`; see Testing rules) |
| `--show-state` | Print `{ state, data }` after each turn (default on) |
| `--lang kn \| en` | Render Kannada or English copy |
| `--script <file>` | Replay a scripted list of inputs instead of reading stdin |

`--script` is the bridge between the two tools: a scenario you debugged by hand becomes a test fixture.

## Suites — `server/tests/`

Paths are relative to `server/tests/`. **Flow suites need the dedicated test database** (see Rules) — they import the real backend, not mocks.

### Running them

| Command | Runs | Needs a DB? |
|---|---|---|
| `npm test` | Pure suites only (top-level `*.test.ts`) | No — finishes in under a second |
| `npm run test:flows` | The DB flow suites only | Yes |
| `npm run test:all` | Everything | Yes |

The slow, DB-backed flow suites are opt-in: they are only included when `RUN_DB_TESTS=1` (set by `test:flows` and `test:all`). That keeps a routine `npm test` instant, and stops a full ~15-minute run on every change. `RUN_DB_TESTS` is separate from the destructive-test guard — a full run still needs `TEST_SUPABASE_*` (see Rules).

### Pure — no database

| File | Covers |
|---|---|
| `whatsapp.test.ts` | Message labels: every button key exists, no label exceeds the WhatsApp caps, list row totals, readable address labels, money formatting, the product name |
| `schedule.test.ts` | IST scheduling maths: 12-hour labels, rolling slots across days, quiet-window dispatch times, unserviceable slots hidden |
| `webhook-signature.test.ts` | `X-Hub-Signature-256` accepted when valid; rejected when missing, tampered, wrong-secret, truncated or empty |
| `docs.test.ts` | Docs drift guard: states, buttons, admin routes and analytics events all match the code |

### Flows — real database

| File | Covers |
|---|---|
| `flows/onboarding.test.ts` | First contact: language → role, language saved per role, re-prompt on bad input |
| `flows/signup.test.ts` | Rider name + Book button; driver name → vehicle → base → radius → KYC → pending; typed text where a location or image is expected is rejected |
| `flows/lifecycle.test.ts` | Full ride: quotes → assign → OTP → DONE → confirm → rate; the dispute safety net; rating is skippable |
| `flows/quotes-list.test.ts` | Quotes as one list, refreshed; rider picks a row; window close does not auto-assign |
| `flows/expiry.test.ts` | Quote-window expiry, Try again reusing pickup/drop, Change details, auto-pick-cheapest, reopening |
| `flows/scheduling.test.ts` | Rolling 3-hour slots → exact time; `pickup_at`; leads held back until dispatch |
| `flows/scheduler.test.ts` | One scheduler pass: scheduled dispatch, missed-window recovery, all-send-failure retry, dispute alert |
| `flows/no-cover.test.ts` | No autos cover the pickup: told immediately; Try again / Change details; "We told N autos" when covered |
| `flows/stale-quote.test.ts` | Quoting a trip that expired or was taken: correct wording, refuses a late amount |
| `flows/lead-template.test.ts` | 24h window: template vs interactive, Kannada locale, body parameters, channel/wamid recorded |
| `flows/gating.test.ts` | Dispatch gating (unapproved / lapsed / out-of-radius / already on a trip); idle priority; post-assignment cancel |
| `flows/number-reveal.test.ts` | Reciprocal number reveal on assignment; friendly status word; nothing revealed while collecting |
| `flows/cancel-button.test.ts` | Cancel button on "finding an auto", and it cancels |
| `flows/cancel-reasons.test.ts` | Rider and driver reasons (incl. typed "Other"); re-dispatch when a driver drops out |
| `flows/drop-proof.test.ts` | Typed drop: optional post-ride location ask on Yes **and** No; driver freed at DONE; disputed driver released |
| `flows/address-and-driver-controls.test.ts` | Address labels over raw coordinates; driver cancel/DONE controls; rider told when the driver starts moving |
| `flows/concurrency.test.ts` | **Two riders accept the same driver — exactly one wins, loser sees remaining quotes** |
| `flows/recover.test.ts` | Office recovery: reset clears a stale `pending_trip_id`, the rider can book again, a live trip is untouched |
| `flows/helpline.test.ts` | "help" answers with the number (Kannada too), still answers unset, reachable by both roles, given on a dispute |
| `flows/help-anywhere.test.ts` | "help" works from every state and leaves the trip untouched |
| `flows/office-alerts.test.ts` | Help/dispute reaches the office: once per request, dispute urgent, none when unconfigured, never self-alert |
| `flows/office-notifications.test.ts` | Driver told on verify/approve/reject; rider told what to do next after a completed ride |
| `flows/delete-user.test.ts` | Deleting a rider/driver removes attached data; driver's trips anonymised |
| `flows/admin-capabilities.test.ts` | Office role override both ways, settings validation, dispute resolution |

### Rules

1. **Sequential, not parallel** — suites share one database. `fileParallelism: false`.
2. **`truncateAll()` in `beforeEach` and `afterAll`.** It must wipe **every**
   table with an FK to a wiped table before its parent. `driver_daily`
   references `drivers`, so omitting it makes the `drivers` delete fail and
   every suite errors with `driver_daily_driver_id_fkey`. Add new tables here
   when you add them to the schema.
3. **Assert on state, DB, and messages** — messages alone can pass while the state is wrong.
4. **When fixing a bug, add the test that would have caught it.** Assert the specific thing that was broken (e.g. after accepting a quote, `stateOf()` must be `trip_assigned`, and no menu must be sent).
5. **30s timeout** for full-lifecycle tests — they hit the real database.
6. **Never run against a project holding real users.** `truncateAll()` is destructive. Set `TEST_SUPABASE_URL` + `TEST_SUPABASE_SERVICE_ROLE_KEY` to a dedicated throwaway project (a Supabase dev branch works); under `NODE_ENV=test` the client uses those and **never** `SUPABASE_URL`. If they are blank, `npm test` fails loudly instead of wiping live data. `ALLOW_DESTRUCTIVE_TESTS=true` is a second opt-in, not the guard.
7. **Stop `npm run dev` before `npm test`.** The dev server starts its own 60s scheduler against the same database, so it can dispatch, expire, or open dispute requests for trips a test just created — the classic cause of a suite that passes alone and fails in a full run.

### Example

```ts
it('does not auto-assign when the window closes; rider must pick', async () => {
  await setAutoPickCheapest(false);
  await seedDriver(DRIVER_A, { lat: 12.97, lng: 77.59, radiusKm: 5 });
  const tripId = await postTrip();

  await driverStep(DRIVER_A, { text: '70' });
  await closeQuoteWindow((await getTrip(tripId)) as never);

  expect((await getTrip(tripId))?.status).toBe('open');
  expect(await stateOf(RIDER_PHONE)).toMatchObject({ state: 'collecting_quotes' });
});
```

## Not covered

- Real Meta API calls — `sendMessage` is always replaced via `setTransport()`. Webhook signature verification is unit-tested separately.
- **Geocoding** — `setupMockSendMessage()` also installs a stub geocoder returning `TEST_ADDRESS`, so no test depends on a provider. Override with `setGeocoder()` when the address matters.
- Delivery/read receipt simulation — the `statuses` webhook is stubbed by inserting into `lead_dispatches` directly.
- Load testing.
