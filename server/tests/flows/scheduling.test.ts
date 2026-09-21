import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  findButtonId,
  messageLog,
  postTrip,
  riderStep,
  seedDriver,
  seedRider,
  setupMockSendMessage,
  stateOf,
  truncateAll,
} from '../engine';

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

describe('scheduled pickup', () => {
  it('creates a trip with a pickup time and holds the leads back', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await riderStep({ text: 'auto' });
    await riderStep({ location: PICKUP });
    await riderStep({ location: { lat: 12.98, lng: 77.6 } });
    await riderStep({ text: 'schedule' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_day');

    await riderStep({ text: 'day_tomorrow' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_hour');

    await riderStep({ text: 'hour_9' });
    const s = await stateOf(RIDER_PHONE);
    expect(s?.state).toBe('collecting_quotes');

    const tripId = s?.data?.pending_trip_id as string;
    const trip = await getTrip(tripId);
    expect(trip?.pickup_at).toBeTruthy();

    // Leads must NOT go out at booking time - the scheduler sends them
    // a few hours before pickup.
    expect(trip?.leads_dispatched).toBe(false);
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();
  }, 60000);

  it('re-prompts instead of advancing on a bad day or hour', async () => {
    await seedRider();
    await riderStep({ text: 'auto' });
    await riderStep({ location: PICKUP });
    await riderStep({ location: { lat: 12.98, lng: 77.6 } });
    await riderStep({ text: 'schedule' });

    await riderStep({ text: 'sometime' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_day');

    await riderStep({ text: 'day_today' });
    await riderStep({ text: 'not-an-hour' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_hour');
  }, 60000);

  it('still books immediately when the rider taps Book now', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    const trip = await getTrip(tripId);
    expect(trip?.pickup_at).toBeNull();
    expect(trip?.leads_dispatched).toBe(true);
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);
});
