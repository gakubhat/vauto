import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  findButtonId,
  messageLog,
  postTrip,
  riderStep,
  seedDriver,
  seedRider,
  setScheduling,
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
  await setScheduling(true);
});
afterAll(async () => {
  await setScheduling(false);
  await truncateAll();
});

/** Book now, up to the confirm card, then open the schedule picker. */
async function toSchedule(): Promise<void> {
  await riderStep({ text: 'auto' });
  await riderStep({ location: PICKUP });
  await riderStep({ location: { lat: 12.98, lng: 77.6 } });
  await riderStep({ text: 'schedule' });
}

/** Last list message sent to the rider. */
function lastList() {
  const m = [...messageLog].reverse().find((x) => x.to === RIDER_PHONE && x.msg.kind === 'list');
  if (!m || m.msg.kind !== 'list') throw new Error('expected a list');
  return m.msg;
}

describe('scheduled pickup', () => {
  it('offers rolling 3-hour slots, then the exact time, and books it', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await toSchedule();
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_slot');

    // Six rolling slots, each labelled with its day; no 24-hour times.
    const slots = lastList();
    const slotRows = slots.sections.reduce((n, s) => n + s.rows.length, 0);
    expect(slotRows).toBe(6);
    expect(slotRows).toBeLessThanOrEqual(10);
    const slotTitles = slots.sections.flatMap((s) => s.rows.map((r) => r.title));
    expect(slotTitles.every((t2) => /(today|tomorrow)$/.test(t2))).toBe(true);
    expect(slotTitles.some((t2) => /\d{2}:\d{2}/.test(t2))).toBe(false);

    const slotId = findButtonId('slot_', RIDER_PHONE) as string;
    expect(slotId).toBeTruthy();
    await riderStep({ text: slotId });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_time');

    // Exact hours inside the slot - at most 3 rows.
    const times = lastList();
    expect(times.sections.reduce((n, s) => n + s.rows.length, 0)).toBeLessThanOrEqual(3);
    const hourId = findButtonId('hour_', RIDER_PHONE) as string;
    expect(hourId).toBeTruthy();
    await riderStep({ text: hourId });

    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
    const tripId = (await stateOf(RIDER_PHONE))?.data?.pending_trip_id as string;
    const trip = await getTrip(tripId);
    expect(trip?.pickup_at).toBeTruthy();
    // Scheduled trips hold their leads back.
    expect(trip?.leads_dispatched).toBe(false);
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();
  }, 60000);

  it('re-prompts instead of advancing on a bad slot', async () => {
    await seedRider();
    await toSchedule();
    await riderStep({ text: 'not-a-slot' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_schedule_slot');
  }, 60000);

  it('still books immediately when the rider taps Book now', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    const trip = await getTrip(tripId);
    expect(trip?.pickup_at).toBeNull();
    expect(trip?.leads_dispatched).toBe(true);
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);

  it('gives the trip a real quote window when the leads finally go out', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await toSchedule();
    await riderStep({ text: findButtonId('slot_', RIDER_PHONE) as string });
    await riderStep({ text: findButtonId('hour_', RIDER_PHONE) as string });
    const tripId = (await stateOf(RIDER_PHONE))?.data?.pending_trip_id as string;

    const held = await getTrip(tripId);
    expect(new Date(held?.quote_window_closes_at as string).getTime()).toBe(
      new Date(held?.pickup_at as string).getTime(),
    );

    // The scheduler fires at pickup - lead_hours. The window must move to now,
    // not stay pinned to pickup, or phase 2 of the same tick would expire the
    // trip the instant its leads were sent.
    const { dispatchScheduledLeads } = await import('../../src/lib/matching');
    await dispatchScheduledLeads(held as never);

    const dispatched = await getTrip(tripId);
    expect(dispatched?.leads_dispatched).toBe(true);
    expect(dispatched?.status).toBe('open');
    expect(new Date(dispatched?.quote_window_closes_at as string).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);
});
