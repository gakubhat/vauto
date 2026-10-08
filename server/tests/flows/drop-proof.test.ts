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
  riderStepAs,
  seedDriver,
  seedRider,
  setFareCheck,
  setupMockSendMessage,
  stateOf,
  truncateAll,
} from '../engine';

const RIDER_2_PHONE = '+919999000008';

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

  it('frees the driver at DONE, before the rider answers', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await completeRide(tripId);

    // The driver has finished; the trip is still awaiting the rider, who stays
    // blocked from booking again until they answer or the dispute clock runs.
    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('in_progress');
    expect(trip?.done_at).toBeTruthy();
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_rider_rating');

    // A second rider can hire him right now, even though the first trip has not
    // been confirmed: the driver index and matching must ignore a finished trip.
    await seedRider(RIDER_2_PHONE, 'Gita');
    await riderStepAs(RIDER_2_PHONE, { text: 'auto' });
    await riderStepAs(RIDER_2_PHONE, { location: PICKUP });
    await riderStepAs(RIDER_2_PHONE, { location: DROP });
    await riderStepAs(RIDER_2_PHONE, { text: 'book_now' });

    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
    await driverStep(DRIVER_A_PHONE, { text: '80' });
    const accept = findButtonId('accept_quote_', RIDER_2_PHONE) as string;
    expect(accept).toBeTruthy();
    await riderStepAs(RIDER_2_PHONE, { text: accept });

    const second = (await stateOf(RIDER_2_PHONE))?.data?.pending_trip_id as string;
    expect((await getTrip(second))?.status).toBe('assigned');
    expect((await getTrip(second))?.driver_id).toBeTruthy();
  }, 60000);

  it('releases a disputed driver back into the matching pool', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await completeRide(tripId);

    await riderStep({ text: 'confirm_no' });
    expect((await getTrip(tripId))?.status).toBe('disputed');

    // The ride is over and the dispute is between the rider and the office, so
    // the driver must be matched again and able to take a new trip - not held
    // out of the pool (or frozen by the unique index) until the office rules.
    await seedRider(RIDER_2_PHONE, 'Gita');
    await riderStepAs(RIDER_2_PHONE, { text: 'auto' });
    await riderStepAs(RIDER_2_PHONE, { location: PICKUP });
    await riderStepAs(RIDER_2_PHONE, { location: DROP });
    await riderStepAs(RIDER_2_PHONE, { text: 'book_now' });

    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
    await driverStep(DRIVER_A_PHONE, { text: '80' });
    const accept = findButtonId('accept_quote_', RIDER_2_PHONE) as string;
    expect(accept).toBeTruthy();
    await riderStepAs(RIDER_2_PHONE, { text: accept });

    const second = (await stateOf(RIDER_2_PHONE))?.data?.pending_trip_id as string;
    expect((await getTrip(second))?.status).toBe('assigned');
    expect((await getTrip(second))?.driver_id).toBeTruthy();
    // The driver quoted and moved on; nothing left him in a dead trip state.
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('idle');
  }, 60000);
});
