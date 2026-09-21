import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { getTrip } from '../../src/state/queries';
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

function bodiesTo(phone: string): string[] {
  return messageLog
    .filter((m) => m.to === phone)
    .map((m) => (m.msg as { body?: string }).body ?? '');
}

describe('cancel reasons', () => {
  it('asks a rider for a reason before cancelling, and stores it', async () => {
    await seedRider();
    const tripId = await postTrip();

    await riderStep({ text: findButtonId('cancel_trip_', RIDER_PHONE) as string });
    await riderStep({ text: 'cancel_yes' });

    // Not cancelled yet - the reason comes first.
    expect((await getTrip(tripId))?.status).toBe('open');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_cancel_reason');
    expect(findButtonId('creason_', RIDER_PHONE)).toBeTruthy();

    await riderStep({ text: 'creason_long_wait' });

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('cancelled');
    expect(trip?.cancel_reason).toBe('Waiting too long');
    expect(trip?.cancelled_by).toBe('rider');

    const { data: events } = await supabaseAdmin
      .from('events')
      .select('properties')
      .eq('trip_id', tripId)
      .eq('type', 'cancelled');
    expect((events ?? [])[0]).toMatchObject({
      properties: { reason_id: 'creason_long_wait' },
    });
  }, 60000);

  it('takes a typed reason when the rider picks Other', async () => {
    await seedRider();
    const tripId = await postTrip();

    await riderStep({ text: findButtonId('cancel_trip_', RIDER_PHONE) as string });
    await riderStep({ text: 'cancel_yes' });
    await riderStep({ text: 'creason_other' });

    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_cancel_reason_text');
    expect((await getTrip(tripId))?.status).toBe('open');

    await riderStep({ text: 'auto never came' });

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('cancelled');
    expect(trip?.cancel_reason).toBe('auto never came');
  }, 60000);

  it('asks a driver for a reason, and stores it', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });

    await driverStep(DRIVER_A_PHONE, { text: findButtonId('cancel_trip_', DRIVER_A_PHONE) as string });
    await driverStep(DRIVER_A_PHONE, { text: 'cancel_yes' });

    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_cancel_reason');

    await driverStep(DRIVER_A_PHONE, { text: 'creason_vehicle_problem' });

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('open');
    expect(trip?.cancel_reason).toBe('Vehicle problem');
  }, 60000);

  it('re-dispatches to other drivers when a driver drops out', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await seedDriver(DRIVER_B_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });

    const since = messageLog.length;
    await driverStep(DRIVER_A_PHONE, { text: findButtonId('cancel_trip_', DRIVER_A_PHONE) as string });
    await driverStep(DRIVER_A_PHONE, { text: 'cancel_yes' });
    await driverStep(DRIVER_A_PHONE, { text: 'creason_too_far' });

    // Other drivers are told again - the rider is not left waiting in silence.
    expect(findButtonIdSince('quote_', DRIVER_B_PHONE, since)).toBeTruthy();

    // And the rider is told an auto dropped out, staying in the search.
    expect(bodiesTo(RIDER_PHONE).some((b) => b.includes('finding another one'))).toBe(true);
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
  }, 60000);
});
