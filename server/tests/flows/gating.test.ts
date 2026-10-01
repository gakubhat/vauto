import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import {
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  findButtonIdSince,
  messageLog,
  postTrip,
  riderStep,
  riderStepAs,
  seedDriver,
  seedRider,
  setupMockSendMessage,
  stateOf,
  truncateAll,
} from '../engine';

const PAST = new Date(Date.now() - 86_400_000).toISOString();

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
});

describe('dispatch gating', () => {
  it('does not send leads to a driver whose subscription lapsed', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      subscriptionUntil: PAST,
    });

    await postTrip();
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();
  }, 60000);

  it('does not send leads to a driver who is not approved', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      approved: false,
    });

    await postTrip();
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();
  }, 60000);

  it('does not send leads to a driver outside their own radius', async () => {
    await seedRider();
    // Far enough away that a 2 km radius cannot cover the pickup.
    await seedDriver(DRIVER_A_PHONE, { lat: 13.2, lng: 77.9, radiusKm: 2 });

    await postTrip();
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();
  }, 60000);

  it('tells a lapsed driver how to renew instead of silently dropping them', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      subscriptionUntil: PAST,
    });

    const before = messageLog.length;
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    const sent = messageLog.slice(before).filter((m) => m.to === DRIVER_A_PHONE);

    expect(sent.length).toBeGreaterThan(0);
    // Kannada copy for a lapsed subscription mentions the renewal contact.
    expect(sent.some((m) => m.msg.kind === 'text' && m.msg.body.includes('ಚಂದಾದಾರಿಕೆ'))).toBe(true);
  }, 60000);

  it('does not send leads to a driver already on an active trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await seedDriver(DRIVER_B_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    // Driver A wins the first trip.
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('trip_assigned');

    // A second rider books; driver A must not be offered it.
    const RIDER_2 = '+919999000021';
    await seedRider(RIDER_2, 'Gita');

    // Only look at messages sent after this point - driver A's lead from the
    // first trip is still in the log.
    const since = messageLog.length;
    await riderStepAs(RIDER_2, { text: 'auto' });
    await riderStepAs(RIDER_2, { location: PICKUP });
    await riderStepAs(RIDER_2, { location: { lat: 12.99, lng: 77.61 } });
    await riderStepAs(RIDER_2, { text: 'book_now' });

    expect(findButtonIdSince('quote_', DRIVER_A_PHONE, since)).toBeUndefined();
    expect(findButtonIdSince('quote_', DRIVER_B_PHONE, since)).toBeTruthy();
    void tripId;
  }, 60000);
});

describe('post-assignment actions', () => {
  // Regression: accepting from collecting_quotes used to wipe pending_trip_id,
  // which silently broke both status and cancel after assignment.
  it('can cancel after accepting a quote', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('trip_assigned');

    // pending_trip_id must still be there for cancel to find the trip.
    expect((await stateOf(RIDER_PHONE))?.data?.pending_trip_id).toBeTruthy();

    await riderStep({ text: 'cancel' });
    await riderStep({ text: 'cancel_yes' });
    await riderStep({ text: 'creason_changed_mind' });

    const { data: trips } = await supabaseAdmin.from('trips').select('status');
    expect((trips ?? [])[0]?.status).toBe('cancelled');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');
  }, 60000);
});

describe('idle priority', () => {
  it('never starts a second booking while a trip is live', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    await riderStep({ text: 'auto' });
    const s = await stateOf(RIDER_PHONE);
    expect(s?.state).toBe('collecting_quotes');
  }, 60000);

  it('clears pending_trip_id when a trip closes', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();

    await riderStep({ text: 'cancel' });
    await riderStep({ text: 'cancel_yes' });
    await riderStep({ text: 'creason_changed_mind' });

    const s = await stateOf(RIDER_PHONE);
    expect(s?.state).toBe('idle');
    expect(s?.data?.pending_trip_id).toBeUndefined();
    void tripId;
  }, 60000);

  /**
   * A newly approved driver has no trip dispatched to him. Saying "Hi" used to
   * fall through to the idle catch-all and answer "Reply with a number to
   * quote" - an instruction he cannot act on, and the first thing he hears
   * after being approved.
   */
  it('greets an idle driver with no trips without asking him to quote', async () => {
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await driverStep(DRIVER_A_PHONE, { text: 'Hi' });

    const body = messageLog
      .filter((m) => m.to === DRIVER_A_PHONE)
      .map((m) => (m.msg as { body: string }).body)
      .join('\n');

    expect(body).not.toContain('Reply with a number to quote');
    expect(body.toLowerCase()).toContain('all set');
  }, 60000);

  it('greets a driver who has work by telling him how many trips are open', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    messageLog.length = 0;
    await driverStep(DRIVER_A_PHONE, { text: 'hello' });

    const body = messageLog
      .filter((m) => m.to === DRIVER_A_PHONE)
      .map((m) => (m.msg as { body: string }).body)
      .join('\n');

    expect(body).toContain('1 trip');
  }, 60000);
});
