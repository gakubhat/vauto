import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { acceptQuote } from '../../src/lib/matching';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  postTrip,
  seedDriver,
  seedRider,
  setupMockSendMessage,
  truncateAll,
} from '../engine';

const RIDER_2_PHONE = '+919999000009';

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

describe('double-assignment guard', () => {
  it('lets exactly one rider win a driver when two accept at the same time', async () => {
    await seedRider(RIDER_PHONE, 'Sita');
    await seedRider(RIDER_2_PHONE, 'Gita');
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 10 });

    // Rider 1 posts a trip; the driver quotes on it.
    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    const quote1 = (findButtonId('accept_quote_', RIDER_PHONE) as string).replace(
      'accept_quote_',
      '',
    );

    // Rider 2 posts a second trip; the same driver quotes on that too.
    const { riderStepAs } = await import('../engine');
    await riderStepAs(RIDER_2_PHONE, { text: 'auto' });
    await riderStepAs(RIDER_2_PHONE, { location: PICKUP });
    await riderStepAs(RIDER_2_PHONE, { location: { lat: 12.99, lng: 77.61 } });
    await riderStepAs(RIDER_2_PHONE, { text: 'book_now' });
    // With two open trips, a bare number asks which trip he means.
    await driverStep(DRIVER_A_PHONE, { text: '80' });
    const pick = findButtonId('pick_trip_', DRIVER_A_PHONE) as string;
    expect(pick).toBeTruthy();
    await driverStep(DRIVER_A_PHONE, { text: pick });
    await driverStep(DRIVER_A_PHONE, { text: '80' });
    const quote2 = (findButtonId('accept_quote_', RIDER_2_PHONE) as string).replace(
      'accept_quote_',
      '',
    );

    // Both riders tap Accept simultaneously.
    const [a, b] = await Promise.all([acceptQuote(quote1), acceptQuote(quote2)]);
    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(1);

    // The loser's trip is still open, and the driver has exactly one active trip.
    const { data: active } = await supabaseAdmin
      .from('trips')
      .select('id, status, driver_id')
      .in('status', ['assigned', 'arrived', 'in_progress', 'disputed']);
    expect(active?.length).toBe(1);

    const { data: openTrips } = await supabaseAdmin
      .from('trips')
      .select('id')
      .eq('status', 'open');
    expect(openTrips?.length).toBe(1);
  }, 60000);
});
