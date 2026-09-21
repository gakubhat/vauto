import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { closeQuoteWindow } from '../../src/lib/matching';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
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

describe('quote window expiry', () => {
  it('expires with no quotes and offers Try again with the same locations', async () => {
    await seedRider();
    // No drivers at all - nothing will be dispatched.
    const tripId = await postTrip();
    expect((await getTrip(tripId))?.status).toBe('open');

    const trip = await getTrip(tripId);
    await closeQuoteWindow(trip as never);

    expect((await getTrip(tripId))?.status).toBe('expired');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_retry_choice');

    const retry = findButtonId('retry_', RIDER_PHONE) as string;
    expect(retry).toBeTruthy();

    const pickupLat = (await getTrip(tripId))?.pickup_lat;
    await riderStep({ text: retry });

    const reopened = await getTrip(tripId);
    expect(reopened?.status).toBe('open');
    // Same pickup - the rider is never asked for the location again.
    expect(reopened?.pickup_lat).toBe(pickupLat);
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
  }, 60000);

  it('Change details sends the rider back to pickup', async () => {
    await seedRider();
    const tripId = await postTrip();
    await closeQuoteWindow((await getTrip(tripId)) as never);

    const change = findButtonId('change_trip_', RIDER_PHONE) as string;
    expect(change).toBeTruthy();
    await riderStep({ text: change });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_pickup_location');
  }, 60000);

  it('auto-accepts the cheapest quote when the window closes', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();

    await driverStep(DRIVER_A_PHONE, { text: '120' });
    await closeQuoteWindow((await getTrip(tripId)) as never);

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('assigned');
    expect(trip?.quoted_amount_paise).toBe(12000);
  }, 60000);

  it('withdraws losing quotes and marks them lapsed', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });

    const accept = findButtonId('accept_quote_', RIDER_PHONE) as string;
    await riderStep({ text: accept });

    const { data: quotes } = await supabaseAdmin
      .from('quotes')
      .select('status')
      .eq('trip_id', tripId);
    const statuses = (quotes ?? []).map((q) => q.status);
    expect(statuses).toContain('accepted');
    expect(statuses).not.toContain('pending');
  }, 60000);
});
