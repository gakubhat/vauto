import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
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

function bodiesTo(phone: string): string[] {
  return messageLog
    .filter((m) => m.to === phone)
    .map((m) => (m.msg as { body?: string }).body ?? '');
}

describe('reciprocal number reveal', () => {
  it('gives each side the other phone number once a trip is assigned', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });

    // Rider can call the driver.
    const riderMsgs = bodiesTo(RIDER_PHONE);
    expect(riderMsgs.some((b) => b.includes('Call'))).toBe(true);
    expect(riderMsgs.some((b) => b.includes(DRIVER_A_PHONE))).toBe(true);

    // Driver can call the rider - this side already existed.
    const driverMsgs = bodiesTo(DRIVER_A_PHONE);
    expect(driverMsgs.some((b) => b.includes(RIDER_PHONE))).toBe(true);
  }, 60000);

  it('keeps the phone visible when the rider asks for trip status', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });

    messageLog.length = 0;
    await riderStep({ text: 'status' });

    const bodies = bodiesTo(RIDER_PHONE);
    expect(bodies.some((b) => b.includes(DRIVER_A_PHONE))).toBe(true);
  }, 60000);

  it('reveals nothing while the trip is still collecting quotes', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });

    // Quote was pushed, but no assignment yet.
    const riderBodies = bodiesTo(RIDER_PHONE);
    expect(riderBodies.some((b) => b.includes(DRIVER_A_PHONE))).toBe(false);
    expect(riderBodies.some((b) => b.includes('Call'))).toBe(false);
  }, 60000);
});
