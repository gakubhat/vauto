import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { deleteDriverCompletely, deleteRiderCompletely } from '../../src/lib/delete-user';
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

describe('deleting a rider', () => {
  it('removes the rider and everything attached to their trips', async () => {
    const riderId = await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });

    // Sanity: the trip has children attached.
    expect(
      ((await supabaseAdmin.from('quotes').select('id').eq('trip_id', tripId)).data ?? []).length,
    ).toBe(1);

    await deleteRiderCompletely(riderId);

    const { data: rider } = await supabaseAdmin.from('riders').select('id').eq('id', riderId);
    expect(rider ?? []).toHaveLength(0);

    const { data: trip } = await supabaseAdmin.from('trips').select('id').eq('id', tripId);
    expect(trip ?? []).toHaveLength(0);

    // Cascaded children are gone too.
    for (const table of ['quotes', 'lead_dispatches', 'events', 'bot_messages', 'trip_otps']) {
      const { data } = await supabaseAdmin.from(table).select('id').eq('trip_id', tripId);
      expect((data ?? []).length, `${table} should be empty`).toBe(0);
    }

    // And the session so the phone can be re-onboarded cleanly.
    const { data: session } = await supabaseAdmin
      .from('conversation_sessions')
      .select('phone')
      .eq('phone', RIDER_PHONE);
    expect(session ?? []).toHaveLength(0);
  }, 60000);

  it('leaves the driver alone when a rider is deleted', async () => {
    const riderId = await seedRider();
    const driverId = await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    await deleteRiderCompletely(riderId);

    const { data: driver } = await supabaseAdmin.from('drivers').select('id').eq('id', driverId);
    expect((driver ?? []).length).toBe(1);
  }, 60000);
});

describe('deleting a driver', () => {
  it('removes the driver but anonymises trips they drove', async () => {
    await seedRider();
    const driverId = await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    expect((await supabaseAdmin.from('trips').select('driver_id').eq('id', tripId).single()).data)
      .toBeTruthy();

    await deleteDriverCompletely(driverId);

    const { data: driver } = await supabaseAdmin.from('drivers').select('id').eq('id', driverId);
    expect(driver ?? []).toHaveLength(0);

    // The rider's trip survives, with the driver detached - not deleted.
    const { data: trip } = await supabaseAdmin
      .from('trips')
      .select('id, driver_id, rider_id')
      .eq('id', tripId)
      .single();
    expect(trip).toBeTruthy();
    expect((trip as { driver_id: string | null }).driver_id).toBeNull();
    expect((trip as { rider_id: string }).rider_id).toBeTruthy();

    // Purely-driver-owned rows are gone.
    const { data: quotes } = await supabaseAdmin
      .from('quotes')
      .select('id')
      .eq('driver_id', driverId);
    expect((quotes ?? []).length).toBe(0);

    const { data: dispatches } = await supabaseAdmin
      .from('lead_dispatches')
      .select('id')
      .eq('driver_id', driverId);
    expect((dispatches ?? []).length).toBe(0);
  }, 60000);
});
