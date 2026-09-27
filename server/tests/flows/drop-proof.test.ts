import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { getTrip } from '../../src/state/queries';
import {
  DROP,
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
  setFareCheck,
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
  await setFareCheck(false);
});
afterAll(async () => {
  await truncateAll();
});

/** Book a trip whose destination was typed, so it has no drop coordinates. */
async function bookWithTypedDrop(): Promise<string> {
  await riderStep({ text: 'auto' });
  await riderStep({ location: PICKUP });
  await riderStep({ text: 'bus stand' });
  await riderStep({ text: 'book_now' });
  return (await stateOf(RIDER_PHONE))?.data?.pending_trip_id as string;
}

/** Drive an accepted trip to DONE, leaving the rider on the completion prompt. */
async function completeRide(tripId: string): Promise<void> {
  await driverStep(DRIVER_A_PHONE, { text: '70' });
  await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
  await driverStep(DRIVER_A_PHONE, { text: 'arrived' });
  const { data: otp } = await supabaseAdmin
    .from('trip_otps')
    .select('code')
    .eq('trip_id', tripId)
    .single();
  await driverStep(DRIVER_A_PHONE, { text: (otp as { code: string }).code });
  await driverStep(DRIVER_A_PHONE, { text: 'trip_done' });
}

async function bookAndFinishWithTypedDrop(): Promise<string> {
  const tripId = await bookWithTypedDrop();
  await completeRide(tripId);
  return tripId;
}

describe('drop location is never a pin', () => {
  it('asks for it on Yes, and fills the trip when shared', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      name: 'Ramesh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    const tripId = await bookAndFinishWithTypedDrop();

    await riderStep({ text: 'confirm_yes' });

    expect((await getTrip(tripId))?.status).toBe('completed');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_drop_proof');
    expect(findButtonId('drop_proof_share', RIDER_PHONE)).toBeTruthy();

    await riderStep({ location: DROP });

    const trip = await getTrip(tripId);
    expect(trip?.drop_lat).toBe(DROP.lat);
    expect(trip?.drop_lng).toBe(DROP.lng);
    expect(trip?.distance_km).not.toBeNull();
    // The rider's typed destination survives next to the pin.
    expect(trip?.drop_text).toBe('bus stand');
    expect(trip?.dispute_lat).toBeNull();
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_rating');
  }, 60000);

  it('skips straight to the rating when the rider declines', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await bookAndFinishWithTypedDrop();

    await riderStep({ text: 'confirm_yes' });
    await riderStep({ text: 'drop_proof_skip' });

    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_rating');
    expect((await getTrip(tripId))?.drop_lat).toBeNull();
  }, 60000);

  it('captures it on No too, as evidence for the office', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await bookAndFinishWithTypedDrop();

    await riderStep({ text: 'confirm_no' });

    expect((await getTrip(tripId))?.status).toBe('disputed');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_drop_proof');

    await riderStep({ location: DROP });

    // Evidence goes to dispute_*; the drop pin is left untouched.
    const trip = await getTrip(tripId);
    expect(trip?.dispute_lat).toBe(DROP.lat);
    expect(trip?.dispute_lng).toBe(DROP.lng);
    expect(trip?.drop_lat).toBeNull();
    expect(trip?.distance_km).toBeNull();
    expect(trip?.drop_text).toBe('bus stand');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');
  }, 60000);

  it('does not ask at all when the drop location is already known', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await completeRide(tripId);

    await riderStep({ text: 'confirm_yes' });

    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_rating');
  }, 60000);
});
