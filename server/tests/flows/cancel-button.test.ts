import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
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

describe('cancelling while waiting', () => {
  it('offers a Cancel button on the "finding an auto" message', async () => {
    await seedRider();
    // A driver must be notified for the rider to actually be waiting.
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    const cancel = findButtonId('cancel_trip_', RIDER_PHONE);
    expect(cancel).toBeTruthy();
  }, 60000);

  it('cancels the trip when that button is tapped', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();

    const cancel = findButtonId('cancel_trip_', RIDER_PHONE) as string;
    await riderStep({ text: cancel });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_cancel_confirm');

    await riderStep({ text: 'cancel_yes' });
    await riderStep({ text: 'creason_got_another_auto' });

    const { data } = await supabaseAdmin.from('trips').select('status').eq('id', tripId).single();
    expect((data as { status: string }).status).toBe('cancelled');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');
  }, 60000);
});
