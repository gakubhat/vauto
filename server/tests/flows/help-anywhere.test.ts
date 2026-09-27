import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
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
  setHelpline,
  setupMockSendMessage,
  startAsNewDriver,
  stateOf,
  truncateAll,
} from '../engine';

const LINE = '+91 94482 67561';
const NEW_DRIVER = '+919999000012';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
  await setHelpline(LINE);
});
afterAll(async () => {
  await truncateAll();
});

function lastTo(phone: string): string {
  const mine = messageLog.filter((m) => m.to === phone);
  return ((mine[mine.length - 1]?.msg as { body?: string })?.body ?? '') as string;
}

async function openHelp(phone: string) {
  const { supabaseAdmin } = await import('../../src/supabase/client');
  const { data } = await supabaseAdmin
    .from('help_requests')
    .select('*')
    .eq('phone', phone)
    .is('closed_at', null);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Drive an accepted trip as far as the rider needs for each phase. */
async function tripReady(): Promise<string> {
  const tripId = await postTrip();
  await driverStep(DRIVER_A_PHONE, { text: '70' });
  return tripId;
}

describe('help reaches the office from every state', () => {
  it('works mid-trip, while an auto is still being found', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await tripReady();
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');

    await riderStep({ text: 'help' });

    // The active-trip branch would have swallowed this and shown trip status.
    expect(lastTo(RIDER_PHONE)).toContain(LINE);
    expect((await openHelp(RIDER_PHONE)).length).toBe(1);
  }, 60000);

  it('works once a driver is assigned', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await tripReady();
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('trip_assigned');

    await riderStep({ text: 'help' });

    expect(lastTo(RIDER_PHONE)).toContain(LINE);
    expect((await openHelp(RIDER_PHONE)).length).toBe(1);
  }, 60000);

  it('works in Kannada mid-trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await tripReady();

    await riderStep({ text: 'ಸಹಾಯ' });

    expect(lastTo(RIDER_PHONE)).toContain(LINE);
  }, 60000);

  it('leaves the trip alone - asking for help must not cancel or disturb it', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await tripReady();

    await riderStep({ text: 'help' });

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('open');
    // Session stays on the trip, so the next message is handled normally.
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
    expect((await stateOf(RIDER_PHONE))?.data).toMatchObject({ pending_trip_id: tripId });
  }, 60000);

  it('links the request to the trip it was raised from', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await tripReady();

    await riderStep({ text: 'help' });

    expect((await openHelp(RIDER_PHONE))[0].trip_id).toBe(tripId);
  }, 60000);

  it('works for a driver blocked pending approval', async () => {
    // A pending driver hits the approval gate before any other handler.
    await startAsNewDriver(NEW_DRIVER);
    await driverStep(NEW_DRIVER, { text: 'Ramesh' });
    await driverStep(NEW_DRIVER, { text: 'KA-05-1234' });
    await driverStep(NEW_DRIVER, { location: PICKUP });
    await driverStep(NEW_DRIVER, { text: 'radius_5' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('idle');

    await driverStep(NEW_DRIVER, { text: 'help' });

    expect(lastTo(NEW_DRIVER)).toContain(LINE);
    expect((await openHelp(NEW_DRIVER)).length).toBe(1);
    expect((await openHelp(NEW_DRIVER))[0].role).toBe('driver');
  }, 60000);

  it('works for a driver mid-ride', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await tripReady();
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    await driverStep(DRIVER_A_PHONE, { text: 'arrived' });

    const { supabaseAdmin } = await import('../../src/supabase/client');
    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code')
      .eq('trip_id', tripId)
      .single();
    await driverStep(DRIVER_A_PHONE, { text: (otp as { code: string }).code });
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('ride_in_progress');

    await driverStep(DRIVER_A_PHONE, { text: 'help' });

    expect(lastTo(DRIVER_A_PHONE)).toContain(LINE);
    expect((await openHelp(DRIVER_A_PHONE)).length).toBe(1);
  }, 60000);
});
