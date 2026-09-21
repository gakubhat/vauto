import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { getTrip } from '../../src/state/queries';
import { setGeocoder } from '../../src/lib/geocode';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  TEST_ADDRESS,
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

function bodiesTo(phone: string): string[] {
  return messageLog
    .filter((m) => m.to === phone)
    .map((m) => (m.msg as { body?: string }).body ?? '');
}

async function assignedTrip(): Promise<string> {
  const tripId = await postTrip();
  await driverStep(DRIVER_A_PHONE, { text: '70' });
  await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
  return tripId;
}

describe('readable addresses', () => {
  it('stores an address instead of bare coordinates', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();

    const trip = await getTrip(tripId);
    expect(trip?.pickup_text).toBe(TEST_ADDRESS);
    expect(trip?.drop_text).toBe(TEST_ADDRESS);
    // Coordinates are still kept for matching.
    expect(trip?.pickup_lat).toBe(PICKUP.lat);
  }, 60000);

  it('shows the address on the trip confirm card, not coordinates', async () => {
    await seedRider();
    await riderStep({ text: 'auto' });
    await riderStep({ location: PICKUP });
    await riderStep({ location: { lat: 12.98, lng: 77.6 } });

    const confirm = bodiesTo(RIDER_PHONE).slice(-1)[0];
    expect(confirm).toContain(TEST_ADDRESS);
    expect(confirm).not.toContain('12.972');
  }, 60000);

  it('prefers a name WhatsApp supplies over geocoding', async () => {
    await seedRider();
    setGeocoder(async () => 'GEOCODED');

    await riderStep({ text: 'auto' });
    await riderStep({ location: { ...PICKUP, name: 'Bus Stand' } });
    await riderStep({ location: { lat: 12.98, lng: 77.6, address: 'Market Road' } });

    const confirm = bodiesTo(RIDER_PHONE).slice(-1)[0];
    expect(confirm).toContain('Bus Stand');
    // The drop had no name, so the geocoder wins over WhatsApp's address blob.
    expect(confirm).toContain('GEOCODED');
    expect(confirm).not.toContain('Market Road');
  }, 60000);

  it('trims a WhatsApp address blob to a few parts when geocoding fails', async () => {
    await seedRider();
    setGeocoder(async () => null);

    await riderStep({ text: 'auto' });
    await riderStep({
      location: {
        lat: 12.98,
        lng: 77.6,
        address: 'XF7H+8R3, Circle, Ullal, SMV, Jnana Ganga Nagar, Bengaluru, Karnataka 560110, India',
      },
    });
    await riderStep({ location: { lat: 12.99, lng: 77.61 } });

    const confirm = bodiesTo(RIDER_PHONE).slice(-1)[0];
    expect(confirm).toContain('Circle, Ullal');
    expect(confirm).not.toContain('Karnataka');
    expect(confirm).not.toContain('India');
    expect(confirm).not.toContain('XF7H+8R3');
  }, 60000);

  it('still books when geocoding fails', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    setGeocoder(async () => null);

    const tripId = await postTrip();
    const trip = await getTrip(tripId);
    expect(trip?.pickup_text).toBeNull();
    expect(trip?.pickup_lat).toBe(PICKUP.lat);
  }, 60000);

  it('falls back to coordinates in the lead when there is no address', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    setGeocoder(async () => null);
    await postTrip();

    const lead = bodiesTo(DRIVER_A_PHONE)[0];
    expect(lead).toContain('12.972');
  }, 60000);
});

describe('driver trip controls', () => {
  it('offers a Cancel button once the driver wins the trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await assignedTrip();

    expect(findButtonId('cancel_trip_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);

  it('reopens the trip when the driver cancels', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await assignedTrip();

    await driverStep(DRIVER_A_PHONE, { text: findButtonId('cancel_trip_', DRIVER_A_PHONE) as string });
    await driverStep(DRIVER_A_PHONE, { text: 'cancel_yes' });
    await driverStep(DRIVER_A_PHONE, { text: 'creason_too_far' });

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('open');
    expect(trip?.driver_id).toBeNull();
  }, 60000);

  it('offers a DONE button while riding, and it ends the trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await assignedTrip();

    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code')
      .eq('trip_id', tripId)
      .single();
    await driverStep(DRIVER_A_PHONE, { text: 'arrived' });
    await driverStep(DRIVER_A_PHONE, { text: (otp as { code: string }).code });

    // The DONE button arrives with "trip started" - no typing required.
    const doneBtn = findButtonId('trip_done', DRIVER_A_PHONE);
    expect(doneBtn).toBeTruthy();

    await driverStep(DRIVER_A_PHONE, { text: doneBtn as string });

    expect((await getTrip(tripId))?.done_at).toBeTruthy();
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_completion_confirm');
  }, 60000);
});

describe('driver on the way', () => {
  it('tells the rider when the driver starts moving, and offers I have arrived', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, language: 'english' });
    await assignedTrip();

    expect(findButtonId('start_trip', DRIVER_A_PHONE)).toBeTruthy();

    messageLog.length = 0;
    await driverStep(DRIVER_A_PHONE, { text: 'start_trip' });

    // The rider is told the driver is on the way.
    expect(bodiesTo(RIDER_PHONE).some((b) => b.includes('started towards you'))).toBe(true);
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('en_route');

    // Driver's next action is arrival.
    expect(findButtonId('arrived', DRIVER_A_PHONE)).toBeTruthy();

    const { data: events } = await supabaseAdmin
      .from('events')
      .select('type')
      .eq('type', 'pickup_started');
    expect((events ?? []).length).toBe(1);
  }, 60000);

  it('still lets a driver jump straight to arrived', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await assignedTrip();

    await driverStep(DRIVER_A_PHONE, { text: 'arrived' });

    const { data } = await supabaseAdmin.from('trips').select('status').eq('id', tripId).single();
    expect((data as { status: string }).status).toBe('arrived');
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_ride_otp');
  }, 60000);

  it('sends a navigate link for the pickup and later for the drop', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await assignedTrip();

    const navMsgs = () =>
      messageLog.filter(
        (m) => m.to === DRIVER_A_PHONE && (m.msg as { kind: string }).kind === 'cta_url',
      );
    expect(navMsgs().length).toBeGreaterThanOrEqual(1);
    const first = navMsgs()[0].msg as unknown as { url: string; button: string };
    expect(first.url).toContain('google.com/maps/dir');
    expect(first.url).toContain(String(PICKUP.lat));

    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code')
      .eq('trip_id', tripId)
      .single();
    await driverStep(DRIVER_A_PHONE, { text: 'arrived' });
    await driverStep(DRIVER_A_PHONE, { text: (otp as { code: string }).code });

    // Second navigate link points at the drop.
    expect(navMsgs().length).toBeGreaterThanOrEqual(2);
  }, 60000);
});
