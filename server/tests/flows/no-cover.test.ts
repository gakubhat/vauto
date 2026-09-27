import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { getTrip } from '../../src/state/queries';
import {
  DROP,
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  findButtonId,
  messageLog,
  messagesTo,
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
  return messagesTo(phone).map((m) => (m.msg as { body?: string }).body ?? '');
}

function lastTo(phone: string): string {
  const mine = bodiesTo(phone);
  return mine[mine.length - 1] ?? '';
}

/** The retry button carries the trip id, so it survives the session reset. */
function tripIdFromRetry(): string {
  const retry = findButtonId('retry_', RIDER_PHONE) as string;
  expect(retry).toBeTruthy();
  return retry.slice('retry_'.length);
}

async function bookNow(): Promise<void> {
  await riderStep({ text: 'auto' });
  await riderStep({ location: PICKUP });
  await riderStep({ location: DROP });
  await riderStep({ text: 'book_now' });
}

describe('no autos cover the pickup', () => {
  it('says so immediately instead of making the rider wait out the window', async () => {
    await seedRider();
    // No drivers seeded - dispatch can reach nobody at all.
    await bookNow();

    expect(lastTo(RIDER_PHONE)).toContain('No autos cover this area right now');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_retry_choice');

    const tripId = tripIdFromRetry();
    expect((await getTrip(tripId))?.status).toBe('expired');
  }, 60000);

  it('offers Try again and Change details', async () => {
    await seedRider();
    await bookNow();

    expect(findButtonId('retry_', RIDER_PHONE)).toBeTruthy();
    expect(findButtonId('change_trip_', RIDER_PHONE)).toBeTruthy();
  }, 60000);

  it('still says so when Try again finds nobody either', async () => {
    await seedRider();
    await bookNow();
    const retry = findButtonId('retry_', RIDER_PHONE) as string;

    await riderStep({ text: retry });

    expect(lastTo(RIDER_PHONE)).toContain('No autos cover this area right now');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_retry_choice');
  }, 60000);

  it('tells the rider how many autos were notified when there is coverage', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      name: 'Ramesh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    await bookNow();

    expect(lastTo(RIDER_PHONE)).toContain('We told 1 auto nearby');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
  }, 60000);

});
