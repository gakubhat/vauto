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
| `truncateAll()` | Wipe all trip tables between tests |
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
| `--fresh` | Wipe sessions and trips before starting |
| `--show-state` | Print `{ state, data }` after each turn (default on) |
| `--lang kn \| en` | Render Kannada or English copy |
| `--script <file>` | Replay a scripted list of inputs instead of reading stdin |

`--script` is the bridge between the two tools: a scenario you debugged by hand becomes a test fixture.

## Suites — `server/tests/`

| File | Covers |
|---|---|
| `rider.signup.test.ts` | Role selection, name, home location, skip |
| `rider.booking.test.ts` | Location → destination → confirm → quotes → accept |
| `rider.scheduling.test.ts` | Today/Tomorrow + hour, `pickup_at`, lead timing |
| `rider.quotes.test.ts` | Quote pushed on arrival, accept, cheapest auto-pick at close |
| `rider.expiry.test.ts` | 30-min expiry, Try again reusing pickup/drop, Change details |
| `rider.cancel.test.ts` | Cancel pre-OTP, blocked after OTP |
| `driver.signup.test.ts` | Name → vehicle → location → radius → KYC → pending |
| `driver.quote.test.ts` | Lead received, quote by button, quote by bare number, validation, duplicate rejected |
| `driver.trip.test.ts` | Arrived → OTP (wrong then right) → DONE → rating |
| `matching.test.ts` | Radius coverage, distance ordering, `max_drivers_per_lead`, pending/subscribed excluded |
| `concurrency.test.ts` | **Two riders accept the same driver — exactly one wins, loser sees remaining quotes** |
| `subscription.test.ts` | Lapsed driver gets no leads, gets renewal message |
| `state.test.ts` | Idle priority order, stale session cleanup, no silent fall-through |
| `i18n.test.ts` | Kannada and English render for every template |

### Rules

1. **Sequential, not parallel** — suites share one database. `fileParallelism: false`.
2. **`truncateAll()` in `beforeEach` and `afterAll`.**
3. **Assert on state, DB, and messages** — messages alone can pass while the state is wrong.
4. **When fixing a bug, add the test that would have caught it.** Assert the specific thing that was broken (e.g. after accepting a quote, `stateOf()` must be `trip_assigned`, and no menu must be sent).
5. **30s timeout** for full-lifecycle tests — they hit the real database.
6. **Never run against a project holding real users.** `truncateAll()` is destructive. Guard with `ALLOW_DESTRUCTIVE_TESTS=true` so it cannot happen by accident.

### Example

```ts
it('auto-accepts the cheapest quote when the window closes', async () => {
  await seedDriver(DRIVER_A, { lat: 12.97, lng: 77.59, radiusKm: 5 });
  await seedDriver(DRIVER_B, { lat: 12.98, lng: 77.60, radiusKm: 5 });
  const { tripId } = await postTrip(PICKUP, DROP);

  await driverStep(DRIVER_A, { text: '90' });
  await driverStep(DRIVER_B, { text: '70' });

  await closeQuoteWindow(tripId);           // test helper, jumps the clock

  const trip = await getTrip(tripId);
  expect(trip.driver_id).toBe(driverBId);  // cheapest won
  expect(trip.quoted_amount_paise).toBe(7000);
  expect(await stateOf(RIDER_PHONE)).toMatchObject({ state: 'trip_assigned' });
});
```

## Not covered

- Real Meta API calls — `sendMessage` is always replaced via `setTransport()`. Webhook signature verification is unit-tested separately.
- **Geocoding** — `setupMockSendMessage()` also installs a stub geocoder returning `TEST_ADDRESS`, so no test depends on a provider. Override with `setGeocoder()` when the address matters.
- Delivery/read receipt simulation — the `statuses` webhook is stubbed by inserting into `lead_dispatches` directly.
- Load testing.
