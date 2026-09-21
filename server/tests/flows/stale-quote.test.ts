import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { closeQuoteWindow } from '../../src/lib/matching';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
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

function lastTo(phone: string): string {
  const mine = messageLog.filter((m) => m.to === phone);
  const last = mine[mine.length - 1];
  return ((last?.msg as { body?: string })?.body ?? '');
}

describe('quoting a trip that is no longer available', () => {
  it('says the trip expired, not that someone took it', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, language: 'english' });

    const tripId = await postTrip();
    const quoteBtn = findButtonId('quote_', DRIVER_A_PHONE) as string;

    // Trip expires with no quotes.
    await closeQuoteWindow((await getTrip(tripId)) as never);
    expect((await getTrip(tripId))?.status).toBe('expired');

    // Driver taps the old Quote button from their chat history.
    await driverStep(DRIVER_A_PHONE, { text: quoteBtn });

    expect(lastTo(DRIVER_A_PHONE)).toContain('no longer available');
    expect(lastTo(DRIVER_A_PHONE)).not.toContain('already taken');
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('idle');
  }, 60000);

  it('says the trip was taken when another driver won it', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, language: 'english' });
    await seedDriver(DRIVER_B_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, language: 'english' });

    const tripId = await postTrip();
    const btnA = findButtonId('quote_', DRIVER_A_PHONE) as string;
    await driverStep(DRIVER_B_PHONE, { text: '60' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    expect((await getTrip(tripId))?.status).toBe('assigned');

    // A taps Quote on a trip that is now assigned to B.
    await driverStep(DRIVER_A_PHONE, { text: btnA });
    expect(lastTo(DRIVER_A_PHONE)).toContain('already taken');
  }, 60000);

  it('refuses an amount sent after the trip expired mid-flow', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, language: 'english' });

    const tripId = await postTrip();
    const quoteBtn = findButtonId('quote_', DRIVER_A_PHONE) as string;
    await driverStep(DRIVER_A_PHONE, { text: quoteBtn });
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_quote_amount');

    await closeQuoteWindow((await getTrip(tripId)) as never);

    await driverStep(DRIVER_A_PHONE, { text: '70' });
    expect(lastTo(DRIVER_A_PHONE)).toContain('no longer available');
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('idle');
  }, 60000);

  it('asks for the price rather than showing an error when the trip is open', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, language: 'english' });
    await postTrip();

    const quoteBtn = findButtonId('quote_', DRIVER_A_PHONE) as string;
    await driverStep(DRIVER_A_PHONE, { text: quoteBtn });

    const body = lastTo(DRIVER_A_PHONE);
    expect(body).toContain('How much will you charge');
    expect(body).not.toContain('Just send the amount');
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_quote_amount');
  }, 60000);
});
