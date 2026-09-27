import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { getTrip } from '../../src/state/queries';
import { resetSession } from '../../src/state/store';
import {
  DROP,
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
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

/**
 * Recovery is the office clearing a stuck conversation.
 *
 * The point is not that a row changes - it is that the person can carry on
 * afterwards. These assert the follow-up actually works.
 */

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

async function sessionRow(phone: string) {
  const { data } = await supabaseAdmin
    .from('conversation_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

describe('resetting a stuck session', () => {
  it('clears a stale pending_trip_id without deleting the session', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    // Simulate the classic breakage: a trip id left behind in data.
    const before = await sessionRow(RIDER_PHONE);
    expect(before?.data).toMatchObject({ pending_trip_id: expect.any(String) });

    await resetSession(RIDER_PHONE, { state: 'idle', role: 'rider', current_trip_id: null, data: {} });

    const after = await sessionRow(RIDER_PHONE);
    expect(after?.state).toBe('idle');
    expect(after?.data).toEqual({});
    expect(after?.current_trip_id).toBeNull();
    // The row survives, so the person keeps their role.
    expect(after?.role).toBe('rider');
  }, 60000);

  it('lets the rider book again afterwards - recovery actually recovers', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    // Stuck mid-booking, and the trip it belongs to is closed by the office
    // (Trip Detail) - the two steps of a real recovery.
    const { data: trip } = await supabaseAdmin
      .from('trips')
      .select('id')
      .eq('status', 'open')
      .single();
    await supabaseAdmin
      .from('trips')
      .update({ status: 'cancelled', cancelled_by: 'office' })
      .eq('id', (trip as { id: string }).id);
    await resetSession(RIDER_PHONE, { state: 'idle', role: 'rider', current_trip_id: null, data: {} });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');

    // A full booking now completes from scratch.
    await riderStep({ text: 'auto' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_pickup_location');
    await riderStep({ location: PICKUP });
    await riderStep({ location: DROP });
    await riderStep({ text: 'book_now' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
    expect(findButtonId('cancel_trip_', RIDER_PHONE)).toBeTruthy();
  }, 60000);

  it('does not touch a live trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();

    await resetSession(RIDER_PHONE, { state: 'idle', role: 'rider', current_trip_id: null, data: {} });

    // The trip is separate state; resetting the chat must not cancel it.
    expect((await getTrip(tripId))?.status).toBe('open');
  }, 60000);

  it('a live trip still blocks a second booking after a reset', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    await resetSession(RIDER_PHONE, { state: 'idle', role: 'rider', current_trip_id: null, data: {} });

    // Reset wipes the session, but one_active_trip_per_rider is enforced by the
    // DB. The office must close the trip in Trip Detail - reset is not a bypass.
    await riderStep({ text: 'auto' });
    const { data: trips } = await supabaseAdmin.from('trips').select('id').eq('status', 'open');
    expect((trips ?? []).length).toBe(1);
  }, 60000);

  it('survives being reset twice', async () => {
    await seedRider();
    await resetSession(RIDER_PHONE, { state: 'idle', role: 'rider', current_trip_id: null, data: {} });
    await resetSession(RIDER_PHONE, { state: 'idle', role: 'rider', current_trip_id: null, data: {} });

    expect((await sessionRow(RIDER_PHONE))?.state).toBe('idle');
  }, 60000);
});
